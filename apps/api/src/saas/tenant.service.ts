import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthUser,
  FirmRole,
  SubscriptionPlan,
  SubscriptionStatus,
  TRIAL_DAYS,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.service';

type FirmRecord = {
  id: string;
  name: string;
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  trialEndAt: Date;
  currentPeriodEnd: Date | null;
  maxUsers: number;
};

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async buildAuthUser(userId: string, firmId?: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    const membership = await this.prisma.firmMember.findFirst({
      where: firmId ? { userId, firmId } : { userId },
      include: { firm: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) return null;

    const firm = membership.firm;
    const subscriptionStatus = await this.syncTrialExpiry(firm);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      firmId: firm.id,
      firmName: firm.name,
      firmRole: membership.role as FirmRole,
      subscriptionStatus,
      subscriptionPlan: firm.subscriptionPlan as SubscriptionPlan | null,
      trialEndAt: firm.trialEndAt.toISOString(),
      currentPeriodEnd: firm.currentPeriodEnd?.toISOString() ?? null,
      maxUsers: firm.maxUsers,
      aiCredits: user.aiCredits,
      role: user.role as AuthUser['role'],
    };
  }

  async syncTrialExpiry(firmOrId: string | FirmRecord): Promise<SubscriptionStatus> {
    const firm =
      typeof firmOrId === 'string'
        ? await this.prisma.firm.findUnique({ where: { id: firmOrId } })
        : firmOrId;
    if (!firm) {
      return SubscriptionStatus.EXPIRED;
    }

    const status = firm.subscriptionStatus as SubscriptionStatus;
    if (status === SubscriptionStatus.TRIAL && firm.trialEndAt < new Date()) {
      await this.prisma.firm.update({
        where: { id: firm.id },
        data: { subscriptionStatus: SubscriptionStatus.EXPIRED },
      });
      return SubscriptionStatus.EXPIRED;
    }
    return status;
  }

  canAccessApp(user: AuthUser): boolean {
    return (
      user.subscriptionStatus === SubscriptionStatus.TRIAL ||
      user.subscriptionStatus === SubscriptionStatus.ACTIVE ||
      user.subscriptionStatus === SubscriptionStatus.PAST_DUE
    );
  }

  isOwner(user: AuthUser): boolean {
    return user.firmRole === FirmRole.OWNER;
  }

  canAccessFinancials(user: AuthUser): boolean {
    return user.firmRole === FirmRole.OWNER;
  }

  getTenantFilter(user: AuthUser) {
    return { firmId: user.firmId };
  }

  async getMemberCount(firmId: string): Promise<number> {
    return this.prisma.firmMember.count({ where: { firmId } });
  }

  async assertCanInvite(
    _firmId: string,
    _inviteEmail?: string,
  ): Promise<{ allowed: boolean; message?: string }> {
    // Single-firm deployment: no seat-limit enforcement.
    return { allowed: true };
  }

  async assertCanAddMember(_firmId: string): Promise<{ allowed: boolean; message?: string }> {
    // Single-firm deployment: no seat-limit enforcement.
    return { allowed: true };
  }

  async listMembers(user: AuthUser) {
    if (!this.isOwner(user)) {
      throw new ForbiddenException('Only owners can list team members');
    }

    const members = await this.prisma.firmMember.findMany({
      where: { firmId: user.firmId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return members.map((m) => ({
      id: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.user.role,
      firmRole: m.role,
      joinedAt: m.createdAt.toISOString(),
    }));
  }

  async removeMember(owner: AuthUser, targetUserId: string) {
    if (!this.isOwner(owner)) {
      throw new ForbiddenException('Only owners can remove team members');
    }
    if (targetUserId === owner.id) {
      throw new BadRequestException('You cannot remove yourself');
    }

    const membership = await this.prisma.firmMember.findUnique({
      where: { firmId_userId: { firmId: owner.firmId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    if (membership.role === FirmRole.OWNER) {
      const ownerCount = await this.prisma.firmMember.count({
        where: { firmId: owner.firmId, role: FirmRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove the only owner');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.firmMember.delete({
        where: { firmId_userId: { firmId: owner.firmId, userId: targetUserId } },
      });
      await tx.auditLog.create({
        data: {
          firmId: owner.firmId,
          userId: owner.id,
          action: 'MEMBER_REMOVED',
          metadata: { removedUserId: targetUserId },
        },
      });
    });

    return { success: true };
  }

  async updateMemberRole(owner: AuthUser, targetUserId: string, role: FirmRole) {
    if (!this.isOwner(owner)) {
      throw new ForbiddenException('Only owners can change member roles');
    }

    const membership = await this.prisma.firmMember.findUnique({
      where: { firmId_userId: { firmId: owner.firmId, userId: targetUserId } },
    });
    if (!membership) {
      throw new NotFoundException('Member not found');
    }

    if (membership.role === FirmRole.OWNER && role !== FirmRole.OWNER) {
      const ownerCount = await this.prisma.firmMember.count({
        where: { firmId: owner.firmId, role: FirmRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot demote the only owner');
      }
    }

    const previousRole = membership.role;

    await this.prisma.$transaction(async (tx) => {
      await tx.firmMember.update({
        where: { firmId_userId: { firmId: owner.firmId, userId: targetUserId } },
        data: { role },
      });
      await tx.auditLog.create({
        data: {
          firmId: owner.firmId,
          userId: owner.id,
          action: 'MEMBER_ROLE_CHANGED',
          metadata: { targetUserId, previousRole, newRole: role },
        },
      });
    });

    return { success: true };
  }

  slugify(name: string): string {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${base || 'firm'}-${suffix}`;
  }

  trialEndDate(from = new Date()): Date {
    const end = new Date(from);
    end.setDate(end.getDate() + TRIAL_DAYS);
    return end;
  }
}
