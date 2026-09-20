import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthUser, FirmRole, maskEmail } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from './tenant.service';
import { EmailService } from '../notifications/email.service';
import { InviteUserDto, AcceptInviteDto, OpenJoinDto } from './dto/saas.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class InvitationService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private email: EmailService,
  ) {}

  async invite(user: AuthUser, dto: InviteUserDto) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can invite users');
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

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.upsert({
      where: { firmId_email: { firmId: user.firmId, email: dto.email } },
      create: {
        firmId: user.firmId,
        email: dto.email,
        role: dto.role ?? FirmRole.ASSISTANT,
        token,
        expiresAt,
        invitedById: user.id,
      },
      update: {
        token,
        expiresAt,
        acceptedAt: null,
        role: dto.role ?? FirmRole.ASSISTANT,
        invitedById: user.id,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'USER_INVITED',
        metadata: { email: maskEmail(dto.email), role: invitation.role },
      },
    });

    const invitePath = `/invite/${invitation.token}`;
    const inviteUrl = `${this.email.getAppUrl()}${invitePath}`;

    let emailSent = false;
    if (this.email.isConfigured()) {
      try {
        await this.email.sendInvitationEmail({
          to: invitation.email,
          firmName: user.firmName,
          inviterName: `${user.firstName} ${user.lastName}`.trim(),
          inviteUrl,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
        });
        emailSent = true;
      } catch {
        // Invitation is saved; owner can still copy the invite link.
      }
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      inviteUrl: invitePath,
      emailSent,
    };
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

  /**
   * สมัครผ่านลิงก์ /join/<slug> โดยไม่ต้องมีรหัสคำเชิญ — สร้างเฉพาะบัญชีใหม่
   * เท่านั้น อีเมลที่มีบัญชีอยู่แล้วต้องผ่านคำเชิญปกติ (กัน endpoint เปิด
   * ผูกบัญชีคนอื่นเข้า firm โดยไม่ยืนยันตัวตน) เข้าเป็น ASSISTANT ก่อน
   * เจ้าของสำนักงานปรับบทบาทได้ที่หน้า Team
   */
  async openJoin(slug: string, dto: OpenJoinDto) {
    const firm = await this.tenant.findBySlug(slug);
    if (!firm) throw new NotFoundException('Unknown firm');

    const check = await this.tenant.assertCanAddMember(firm.id);
    if (!check.allowed) throw new BadRequestException(check.message);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException(
        'อีเมลนี้มีบัญชีอยู่แล้ว — ให้เจ้าของสำนักงานส่งคำเชิญ หรือเข้าสู่ระบบด้วยบัญชีเดิม',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'LAWYER',
        },
      });
      await tx.firmMember.create({
        data: { firmId: firm.id, userId: created.id, role: 'ASSISTANT' },
      });
      await tx.auditLog.create({
        data: {
          firmId: firm.id,
          userId: created.id,
          action: 'INVITATION_ACCEPTED',
          metadata: { email: maskEmail(email), openJoin: true },
        },
      });
      return created;
    });

    const authUser = await this.tenant.buildAuthUser(user.id, firm.id);
    if (!authUser) throw new BadRequestException('Failed to join firm');
    return authUser;
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

    const authUser = await this.tenant.buildAuthUser(user!.id, invitation.firmId);
    if (!authUser) throw new BadRequestException('Failed to join firm');
    return authUser;
  }

  async listPending(user: AuthUser) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can view invitations');
    }
    return this.prisma.invitation.findMany({
      where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(user: AuthUser, invitationId: string) {
    if (!this.tenant.isOwner(user)) {
      throw new ForbiddenException('Only owners can cancel invitations');
    }

    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, firmId: user.firmId, acceptedAt: null },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
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
