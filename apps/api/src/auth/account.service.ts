import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import { EmailService } from '../notifications/email.service';
import { platformAdminEmails } from '../common/guards/platform-admin.guard';
import { UpdateAccountProfileDto } from './dto/account.dto';

const DELETION_REQUESTED = 'ACCOUNT_DELETION_REQUESTED';
/** Promised to the person in the app and on the web (PDPA: answer data-subject requests within 30 days). */
export const DELETION_DUE_DAYS = 30;
const SUPPORT_EMAIL = 'hello@samnuan.com';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private prisma: PrismaService, private tenant: TenantService, private email: EmailService) {}

  async updateProfile(userId: string, firmId: string, dto: UpdateAccountProfileDto) {
    // Global identity: the authenticated person may change only their own names.
    await this.prisma.user.update({
      where: { id: userId },
      data: { firstName: dto.firstName, lastName: dto.lastName },
      select: { id: true },
    });
    return this.tenant.buildAuthUser(userId, firmId);
  }

  private async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    return user.passwordHash;
  }

  async changePassword(userId: string, currentPassword: string, password: string) {
    const previousHash = await this.verifyPassword(userId, currentPassword);
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async tx => {
      // A concurrent reset/change must win over verification against an old password.
      const changed = await tx.user.updateMany({ where: { id: userId, passwordHash: previousHash }, data: { passwordHash } });
      if (changed.count !== 1) throw new UnauthorizedException('Password changed. Sign in again.');
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { success: true };
  }

  async getDeletionRequest(userId: string) {
    const request = await this.prisma.auditLog.findFirst({
      where: { userId, action: DELETION_REQUESTED },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    return request ? { id: request.id, requestedAt: request.createdAt, status: 'PENDING_REVIEW' as const } : null;
  }

  async requestDeletion(userId: string, firmId: string, currentPassword: string) {
    await this.verifyPassword(userId, currentPassword);
    const existing = await this.getDeletionRequest(userId);
    if (existing) return existing;
    // Durable support request, not a member-removal operation or a claim of completed deletion.
    // The person can belong to several firms; shared legal records need an operator review.
    const request = await this.prisma.auditLog.create({
      data: {
        userId, firmId, action: DELETION_REQUESTED,
        metadata: { scope: 'GLOBAL_ACCOUNT_AND_ASSOCIATED_PERSONAL_DATA', status: 'PENDING_REVIEW' },
      },
      select: { id: true, createdAt: true },
    });
    await this.notifyOperators(userId, request.id, request.createdAt)
      .catch(error => this.logger.error(`Account deletion notice ${request.id} failed: ${error instanceof Error ? error.message : 'unknown'}`));
    return { id: request.id, requestedAt: request.createdAt, status: 'PENDING_REVIEW' as const };
  }

  /** The audit row is the durable record; a failed email must not fail the person's request. */
  private async notifyOperators(userId: string, requestId: string, requestedAt: Date) {
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const recipients = [...platformAdminEmails()];
    for (const to of recipients.length ? recipients : [SUPPORT_EMAIL]) {
      await this.email.sendAccountDeletionRequestEmail({
        to, requestId, accountEmail: account?.email ?? userId, requestedAt, dueDays: DELETION_DUE_DAYS,
      });
    }
  }
}
