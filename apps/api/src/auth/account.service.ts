import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import { UpdateAccountProfileDto } from './dto/account.dto';

const DELETION_REQUESTED = 'ACCOUNT_DELETION_REQUESTED';

@Injectable()
export class AccountService {
  constructor(private prisma: PrismaService, private tenant: TenantService) {}

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
    return { id: request.id, requestedAt: request.createdAt, status: 'PENDING_REVIEW' as const };
  }
}
