import { Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { Prisma, TaskStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private billingService: BillingService,
  ) {}

  /**
   * What "still on my plate" means. TODO is work not started, DONE is finished;
   * everything between is work the caller has picked up and not yet let go of.
   */
  private static readonly ACTIVE_TASK_STATUSES = [
    'IN_PROGRESS',
    'PENDING_REVIEW',
    'NEEDS_REVISION',
  ];

  /** How many rows of active work the home page shows before deferring to /todos. */
  private static readonly ACTIVE_TASK_TAKE = 8;

  private getFirmExpenseFilter(firmId: string) {
    return {
      OR: [
        { case: { firmId } },
        { caseId: null, user: { firmMembers: { some: { firmId } } } },
      ],
    };
  }

  /**
   * The work the caller has personally picked up, case tasks and standalone
   * todos alike. Scoped by `assigneeId` rather than the role visibility filter:
   * this answers "what am *I* in the middle of", not "what may I see".
   */
  private async getActiveTasks(user: AuthUser, caseFilter: Prisma.CaseWhereInput) {
    const rows = await this.prisma.task.findMany({
      where: {
        assigneeId: user.id,
        status: { in: DashboardService.ACTIVE_TASK_STATUSES as TaskStatus[] },
        OR: [{ caseId: null }, { case: caseFilter }],
      },
      // Postgres sorts NULLs last on ASC, so undated work falls below dated work.
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: DashboardService.ACTIVE_TASK_TAKE,
      include: {
        case: { select: { id: true, ownRef: true, title: true } },
        onHold: { select: { reason: true, nextFollowUpAt: true, endedAt: true } },
      },
    });

    return rows.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      dueDate: task.dueDate,
      caseId: task.caseId,
      caseRef: task.case?.ownRef ?? null,
      caseTitle: task.case?.title ?? null,
      // A hold that has ended is history; only an open one still blocks the task.
      onHold:
        task.onHold && !task.onHold.endedAt
          ? { reason: task.onHold.reason, nextFollowUpAt: task.onHold.nextFollowUpAt }
          : null,
    }));
  }

  async getTaskInbox(user: AuthUser) {
    return this.prisma.task.findMany({
      where: { AND: [this.caseAccess.getTaskFilterForUser(user), { OR: [{ caseId: null }, { case: this.caseAccess.getCaseFilterForUser(user) }] }], status: { not: 'DONE' } },
      include: { case: { select: { id: true, ownRef: true, title: true } }, assignee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async getStats(user: AuthUser) {
    const caseFilter = this.caseAccess.getCaseFilterForUser(user);
    const firmExpenseFilter = this.getFirmExpenseFilter(user.firmId);
    const isOwner = user.firmRole === FirmRole.OWNER;
    const expenseScope = isOwner
      ? firmExpenseFilter
      : { userId: user.id, ...firmExpenseFilter };
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCases, openCases, upcomingEvents, overdueTasks, myTasks] =
      await Promise.all([
        this.prisma.case.count({ where: caseFilter }),
        this.prisma.case.count({
          where: { ...caseFilter, status: { not: 'CLOSED' } },
        }),
        this.prisma.calendarEvent.count({
          where: {
            case: caseFilter,
            startAt: { gte: now },
          },
        }),
        this.prisma.task.count({
          where: {
            case: caseFilter,
            status: { not: 'DONE' },
            dueDate: { lt: now },
            ...this.caseAccess.getTaskFilterForUser(user),
          },
        }),
        this.prisma.task.count({
          where: {
            case: caseFilter,
            status: { not: 'DONE' },
            ...this.caseAccess.getTaskFilterForUser(user),
          },
        }),
      ]);

    // "Awaiting approval" means status PENDING everywhere — the count, the
    // list below it, and the expense pages all use the same definition.
    // Approved-but-unpaid is a separate figure, not folded into it.
    const [
      pendingExpenseCount,
      approvedExpenseCount,
      pendingReimbursementList,
      timeEntries,
      caseProfits,
      activeTasks,
    ] = await Promise.all([
        this.prisma.expense.count({
          where: { ...expenseScope, status: 'PENDING' },
        }),
        this.prisma.expense.count({
          where: { ...expenseScope, status: 'APPROVED' },
        }),
        this.prisma.expense.findMany({
          where: { ...expenseScope, status: 'PENDING' },
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            user: { select: { firstName: true, lastName: true } },
            case: { select: { ownRef: true, title: true } },
          },
        }),
        this.prisma.timeEntry.findMany({
          where: { case: caseFilter, billable: true },
          select: { hours: true, rate: true, date: true },
        }),
        this.billingService.getCaseProfits(user),
        this.getActiveTasks(user, caseFilter),
      ]);

    const monthlyRevenue = timeEntries
      .filter((entry) => entry.date >= monthStart)
      .reduce((sum, entry) => sum + entry.hours * entry.rate, 0);

    const totalNetProfit = caseProfits.reduce((sum, row) => sum + row.profit, 0);

    const recentCases = await this.prisma.case.findMany({
      where: caseFilter,
      take: 5,
      orderBy: { updatedAt: 'desc' },
      include: {
        leadLawyer: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    const upcomingHearings = await this.prisma.calendarEvent.findMany({
      where: {
        case: caseFilter,
        startAt: { gte: now },
        type: 'COURT_DATE',
      },
      take: 5,
      orderBy: { startAt: 'asc' },
      include: {
        case: {
          select: {
            ownRef: true,
            title: true,
            courtName: true,
            clientName: true,
            client: { select: { name: true } },
          },
        },
      },
    });

    return {
      firmId: user.firmId,
      firmName: user.firmName,
      role: user.role,
      stats: {
        totalCases,
        openCases,
        upcomingEvents,
        overdueTasks,
        myTasks,
        pendingExpenses: pendingExpenseCount,
        approvedExpenses: approvedExpenseCount,
        monthlyRevenue,
        totalNetProfit,
      },
      caseProfits: caseProfits.slice(0, 8),
      activeTasks,
      recentCases,
      upcomingHearings,
      pendingReimbursements: pendingReimbursementList,
    };
  }

  /**
   * Per-lawyer load for the team workload screen: who holds how much, so work
   * can be rebalanced before someone drowns. Visible to every firm member by
   * design — seeing the imbalance is the point; reassignment itself stays
   * guarded by the task routes.
   */
  async getWorkload(user: AuthUser) {
    const now = new Date();
    const weekEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const lawyers = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'LAWYER'] },
        firmMembers: { some: { firmId: user.firmId } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    });
    const lawyerIds = lawyers.map((l) => l.id);

    // A standalone todo has no case; scope it by the assignee being staff of
    // this firm (the same tenancy rule TasksService.standaloneFirmScope uses).
    const taskScope: Prisma.TaskWhereInput = {
      assigneeId: { in: lawyerIds },
      status: { not: 'DONE' },
      OR: [{ caseId: null }, { case: { firmId: user.firmId, deletedAt: null } }],
    };

    const [openTasks, overdueTasks, openCases, weekHearings] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        _count: { _all: true },
        where: taskScope,
      }),
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        _count: { _all: true },
        where: { ...taskScope, dueDate: { lt: now } },
      }),
      this.prisma.case.groupBy({
        by: ['leadLawyerId'],
        _count: { _all: true },
        where: {
          firmId: user.firmId,
          status: { not: 'CLOSED' },
          leadLawyerId: { in: lawyerIds },
        },
      }),
      // A hearing counts against whoever actually attends: the event's
      // assignee when set, otherwise the case's lead lawyer.
      this.prisma.calendarEvent.findMany({
        where: {
          case: { firmId: user.firmId },
          type: 'COURT_DATE',
          startAt: { gte: now, lt: weekEndsAt },
        },
        select: { assigneeId: true, case: { select: { leadLawyerId: true } } },
      }),
    ]);

    const countBy = (rows: Array<{ assigneeId?: string | null; leadLawyerId?: string }>) => {
      const map = new Map<string, number>();
      for (const row of rows as Array<Record<string, unknown>>) {
        const key = (row.assigneeId ?? row.leadLawyerId) as string | null;
        if (key) map.set(key, (map.get(key) ?? 0) + Number((row as any)._count?._all ?? 1));
      }
      return map;
    };
    const openTaskCounts = countBy(openTasks as any);
    const overdueCounts = countBy(overdueTasks as any);
    const caseCounts = countBy(openCases as any);
    const hearingCounts = new Map<string, number>();
    for (const event of weekHearings) {
      const key = event.assigneeId ?? event.case.leadLawyerId;
      hearingCounts.set(key, (hearingCounts.get(key) ?? 0) + 1);
    }

    const members = lawyers
      .map((lawyer) => ({
        id: lawyer.id,
        name: `${lawyer.firstName} ${lawyer.lastName}`.trim(),
        openTasks: openTaskCounts.get(lawyer.id) ?? 0,
        overdueTasks: overdueCounts.get(lawyer.id) ?? 0,
        openCases: caseCounts.get(lawyer.id) ?? 0,
        hearingsThisWeek: hearingCounts.get(lawyer.id) ?? 0,
      }))
      .sort((a, b) => b.openTasks - a.openTasks || b.overdueTasks - a.overdueTasks);

    return {
      asOf: now.toISOString(),
      weekEndsAt: weekEndsAt.toISOString(),
      totals: {
        openTasks: members.reduce((sum, m) => sum + m.openTasks, 0),
        overdueTasks: members.reduce((sum, m) => sum + m.overdueTasks, 0),
        hearingsThisWeek: members.reduce((sum, m) => sum + m.hearingsThisWeek, 0),
      },
      members,
    };
  }
}
