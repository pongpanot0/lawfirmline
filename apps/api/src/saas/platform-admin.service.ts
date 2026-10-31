import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '@lawfirm/shared';
import { UpdatePlatformFirmDto } from './dto/platform-admin.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The operator's console across every firm; callers are gated by PlatformAdminGuard. */
@Injectable()
export class PlatformAdminService {
  constructor(private prisma: PrismaService) {}

  async overview() {
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [byStatus, newFirms30d, users, paid30d] = await Promise.all([
      this.prisma.firm.groupBy({ by: ['subscriptionStatus'], _count: { _all: true } }),
      this.prisma.firm.count({ where: { createdAt: { gte: since } } }),
      this.prisma.user.count(),
      this.prisma.billingInvoice.aggregate({ where: { status: 'PAID', paidAt: { gte: since } }, _sum: { amount: true } }),
    ]);
    return {
      firmsByStatus: Object.fromEntries(byStatus.map((row) => [row.subscriptionStatus, row._count._all])),
      newFirms30d,
      users,
      revenue30d: paid30d._sum.amount ?? 0,
    };
  }

  async listFirms(q?: string) {
    const search = q?.trim();
    const firms = await this.prisma.firm.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { members: { some: { user: { email: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        trialEndAt: true,
        currentPeriodEnd: true,
        maxUsers: true,
        stripeSubscriptionId: true,
        createdAt: true,
        _count: { select: { members: true, cases: true } },
        members: { where: { role: 'OWNER' }, take: 1, orderBy: { createdAt: 'asc' }, select: { user: { select: { email: true } } } },
      },
    });
    return firms.map(({ members, _count, stripeSubscriptionId, ...firm }) => ({
      ...firm,
      memberCount: _count.members,
      caseCount: _count.cases,
      ownerEmail: members[0]?.user.email ?? null,
      // Stripe's webhook rewrites status/plan for these firms, so a manual edit may not stick.
      stripeManaged: !!stripeSubscriptionId,
    }));
  }

  async listMembers(firmId: string) {
    await this.findFirm(firmId);
    const members = await this.prisma.firmMember.findMany({
      where: { firmId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, createdAt: true, user: { select: { id: true, email: true, firstName: true, lastName: true, mfaEnabled: true } } },
    });
    const lastSeen = await this.prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: members.map((m) => m.user.id) } },
      _max: { lastUsedAt: true },
    });
    const seenBy = new Map(lastSeen.map((row) => [row.userId, row._max.lastUsedAt]));
    return members.map(({ user, ...member }) => ({ ...user, ...member, lastSeenAt: seenBy.get(user.id) ?? null }));
  }

  /** Everything the console's firm page shows, in one call. */
  async firmDetail(firmId: string) {
    const firm = await this.findFirm(firmId);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const [members, cases, clients, intakes, documents, ai30d, billingInvoices, auditLogs, openErrors, pendingInvitations] = await Promise.all([
      this.listMembers(firmId),
      this.prisma.case.count({ where: { firmId } }),
      this.prisma.client.count({ where: { firmId } }),
      this.prisma.intake.count({ where: { firmId } }),
      this.prisma.document.count({ where: { case: { firmId } } }),
      this.prisma.aiRun.aggregate({ where: { firmId, createdAt: { gte: since } }, _count: { _all: true }, _sum: { inputTokens: true, outputTokens: true } }),
      this.prisma.billingInvoice.findMany({
        where: { firmId },
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { id: true, invoiceNumber: true, plan: true, billingPeriod: true, amount: true, currency: true, status: true, paidAt: true, createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: { firmId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, action: true, metadata: true, createdAt: true, user: { select: { email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.errorLog.count({ where: { firmId, resolvedAt: null } }),
      this.prisma.invitation.count({ where: { firmId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    const { stripeSubscriptionId, stripeCustomerId, ...rest } = firm;
    return {
      firm: { ...rest, stripeManaged: !!stripeSubscriptionId, stripeCustomerId },
      members,
      usage: {
        cases,
        clients,
        intakes,
        documents,
        pendingInvitations,
        aiRuns30d: ai30d._count._all,
        aiTokens30d: (ai30d._sum.inputTokens ?? 0) + (ai30d._sum.outputTokens ?? 0),
      },
      billingInvoices,
      auditLogs,
      openErrors,
    };
  }

  async updateFirm(admin: AuthUser, firmId: string, dto: UpdatePlatformFirmDto) {
    const before = await this.findFirm(firmId);
    const data = {
      subscriptionStatus: dto.subscriptionStatus,
      subscriptionPlan: dto.subscriptionPlan,
      maxUsers: dto.maxUsers,
      trialEndAt: dto.trialEndAt ? new Date(dto.trialEndAt) : undefined,
      // null clears the period end (a firm that never lapses).
      currentPeriodEnd: dto.currentPeriodEnd === undefined ? undefined : dto.currentPeriodEnd && new Date(dto.currentPeriodEnd),
    };
    const [firm] = await this.prisma.$transaction([
      this.prisma.firm.update({ where: { id: firmId }, data }),
      this.prisma.auditLog.create({
        data: {
          firmId,
          action: 'PLATFORM_FIRM_UPDATED',
          metadata: {
            by: admin.email,
            from: {
              subscriptionStatus: before.subscriptionStatus,
              subscriptionPlan: before.subscriptionPlan,
              maxUsers: before.maxUsers,
              trialEndAt: before.trialEndAt.toISOString(),
              currentPeriodEnd: before.currentPeriodEnd?.toISOString() ?? null,
            },
            to: JSON.parse(JSON.stringify(dto)),
          },
        },
      }),
    ]);
    return firm;
  }

  private async findFirm(id: string) {
    const firm = await this.prisma.firm.findUnique({ where: { id } });
    if (!firm) throw new NotFoundException('ไม่พบสำนักงาน');
    return firm;
  }
}
