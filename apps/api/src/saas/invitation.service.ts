import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Prisma, Invitation } from '../generated/prisma';
import { AuthUser, FirmRole, canInviteFirmRole, hasFirmCapability, maskEmail } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from './tenant.service';
import { EmailService } from '../notifications/email.service';
import { InviteUserDto, AcceptInviteDto } from './dto/saas.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private email: EmailService,
  ) {}

  async invite(user: AuthUser, dto: InviteUserDto) {
    if (!hasFirmCapability(user.firmRole, 'inviteMembers')) {
      throw new ForbiddenException('Insufficient permissions to invite users');
    }
    if (!canInviteFirmRole(user.firmRole, dto.role ?? FirmRole.ASSISTANT)) {
      throw new ForbiddenException('ไม่มีสิทธิ์เชิญตำแหน่งนี้');
    }

    const check = await this.tenant.assertCanInvite(user.firmId, dto.email);
    if (!check.allowed) {
      throw new BadRequestException(check.message);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const member = await this.prisma.firmMember.findUnique({
        where: { firmId_userId: { firmId: user.firmId, userId: existingUser.id } },
      });
      if (member) {
        throw new BadRequestException('User is already a member of this firm');
      }
    }

    // The upsert below would rewrite an existing pending invitation's role, so the
    // caller must also be allowed to invite the role it currently carries.
    const pending = await this.prisma.invitation.findUnique({
      where: { firmId_email: { firmId: user.firmId, email: dto.email } },
    });
    if (pending && !pending.acceptedAt && pending.expiresAt > new Date() && !canInviteFirmRole(user.firmRole, pending.role as FirmRole)) {
      throw new ForbiddenException('ไม่มีสิทธิ์แก้ไขคำเชิญตำแหน่งนี้');
    }

    const invitation = await this.createForImport(this.prisma, user, dto.email, dto.role ?? FirmRole.ASSISTANT);
    const emailSent = await this.sendInvitation(user, invitation);
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviteUrl: `/invite/${invitation.token}`,
      emailSent,
    };
  }

  /** Caller checks permissions, duplicates and seats before writing; accepts the import transaction. */
  async createForImport(tx: Prisma.TransactionClient, user: AuthUser, email: string, role: FirmRole) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await tx.invitation.upsert({
      where: { firmId_email: { firmId: user.firmId, email } },
      create: { firmId: user.firmId, email, role, token, expiresAt, invitedById: user.id },
      update: { token, expiresAt, acceptedAt: null, role, invitedById: user.id },
    });
    await tx.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action: 'USER_INVITED', metadata: { email: maskEmail(email), role: invitation.role } },
    });
    return invitation;
  }

  /** Email is best effort after the invitation is saved, for both normal and Excel invitations. */
  async sendInvitation(user: AuthUser, invitation: Pick<Invitation, 'email' | 'role' | 'token' | 'expiresAt'>): Promise<boolean> {
    if (!this.email.isConfigured()) return false;
    try {
      await this.email.sendInvitationEmail({
        to: invitation.email,
        firmName: user.firmName,
        inviterName: `${user.firstName} ${user.lastName}`.trim(),
        inviteUrl: `${this.email.getAppUrl()}/invite/${invitation.token}`,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      });
      return true;
    } catch (error) {
      this.logger.warn(`Invitation email failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  }

  async getByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { firm: { select: { name: true } } },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new NotFoundException('Invitation not found or expired');
    }
    return {
      email: invitation.email,
      firmName: invitation.firm.name,
      role: invitation.role,
    };
  }

  async accept(dto: AcceptInviteDto) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.token },
      include: { firm: true },
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    const check = await this.tenant.assertCanAddMember(invitation.firmId);
    if (!check.allowed) {
      throw new BadRequestException(check.message);
    }

    let user = await this.prisma.user.findUnique({ where: { email: invitation.email } });
    // The inviter holds this token too, so for an existing account the token
    // alone must not be a login: the account's own password has to match.
    const existing = Boolean(user);
    if (user && !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('อีเมลนี้มีบัญชีอยู่แล้ว — ใส่รหัสผ่านของบัญชีเดิมเพื่อเข้าร่วม');
    }

    await this.prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash: await bcrypt.hash(dto.password, 10),
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: 'LAWYER',
          },
        });
      }

      await tx.firmMember.create({
        data: {
          firmId: invitation.firmId,
          userId: user!.id,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          firmId: invitation.firmId,
          userId: user!.id,
          action: 'INVITATION_ACCEPTED',
          metadata: { email: maskEmail(invitation.email) },
        },
      });
    });

    // An existing account signs in through the normal login (which also runs its MFA).
    if (existing) return { existingAccount: { email: invitation.email, firmId: invitation.firmId } };
    const authUser = await this.tenant.buildAuthUser(user!.id, invitation.firmId);
    if (!authUser) throw new BadRequestException('Failed to join firm');
    return { authUser };
  }

  async listPending(user: AuthUser) {
    if (!hasFirmCapability(user.firmRole, 'inviteMembers')) {
      throw new ForbiddenException('Insufficient permissions to view invitations');
    }
    return this.prisma.invitation.findMany({
      where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } },
      // Never return the token: holding it is enough to accept the invitation.
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true, invitedById: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(user: AuthUser, invitationId: string) {
    if (!hasFirmCapability(user.firmRole, 'inviteMembers')) {
      throw new ForbiddenException('Insufficient permissions to cancel invitations');
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, firmId: user.firmId, acceptedAt: null },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (!canInviteFirmRole(user.firmRole, invitation.role as FirmRole)) {
      throw new ForbiddenException('ไม่มีสิทธิ์ยกเลิกคำเชิญตำแหน่งนี้');
    }

    await this.prisma.invitation.delete({ where: { id: invitationId } });
    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'INVITATION_CANCELLED',
        metadata: { email: maskEmail(invitation.email) },
      },
    });

    return { success: true };
  }
}
