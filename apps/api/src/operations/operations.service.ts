import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, AssignmentType, CaseStatus, Role, TaskStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { WorkloadQueryDto } from './dto/operations.dto';

interface ActiveCaseRow {
  id: string;
  title: string;
  status: string;
  claimedAmount: number | null;
  leadLawyerId: string;
  assignments: { userId: string }[];
  tasks: { dueDate: Date | null }[];
  calendarEvents: { startAt: Date }[];
}

@Injectable()
export class OperationsService {
  constructor(private prisma: PrismaService) {}

  private async getActiveCases(firmId: string, now: Date): Promise<ActiveCaseRow[]> {
    return this.prisma.case.findMany({
      where: { firmId, status: { not: CaseStatus.CLOSED } },
      select: {
        id: true,
        title: true,
        status: true,
        claimedAmount: true,
        leadLawyerId: true,
        assignments: {
          where: { assignmentType: AssignmentType.BUDDY },
          select: { userId: true },
        },
        tasks: {
          where: { status: { not: TaskStatus.DONE } },
          select: { dueDate: true },
        },
        calendarEvents: {
          where: { startAt: { gte: now } },
          select: { startAt: true },
        },
      },
    });
  }

  /** SLA / operational targets — firm-configurable, sensible defaults. */
  async getSlaConfig(user: AuthUser) {
    const firm = await this.prisma.firm.findUniqueOrThrow({
      where: { id: user.firmId },
      select: { slaConfig: true },
    });
    return {
      caseUpdateDays: 14,
      stuckStatusDays: 30,
      reviewDays: 3,
      ...((firm.slaConfig as Record<string, number> | null) ?? {}),
    };
  }

  async updateSlaConfig(user: AuthUser, dto: Record<string, number>) {
    await this.prisma.firm.update({
      where: { id: user.firmId },
      data: { slaConfig: dto },
    });
    return this.getSlaConfig(user);
  }

  /**
   * Team performance (operational metrics, ไม่ใช่ leaderboard): completed,
   * average turnaround, overdue rate per member over the window.
   * ponytail: turnaround ≈ updatedAt - createdAt of DONE tasks (no completedAt column).
   */
  async getTeamPerformance(user: AuthUser, days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const now = new Date();
    const firmScope = {
      OR: [
        { case: { firmId: user.firmId } },
        { caseId: null, createdBy: { firmMembers: { some: { firmId: user.firmId } } } },
      ],
    };
    const [members, doneTasks, openTasks] = await Promise.all([
      this.getFirmMembers(user.firmId),
      this.prisma.task.findMany({
        where: { ...firmScope, status: TaskStatus.DONE, updatedAt: { gte: since } },
        select: { assigneeId: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.task.findMany({
        where: { ...firmScope, status: { not: TaskStatus.DONE } },
        select: { assigneeId: true, dueDate: true },
      }),
    ]);

    return members.map((m) => {
      const done = doneTasks.filter((t) => t.assigneeId === m.id);
      const open = openTasks.filter((t) => t.assigneeId === m.id);
      const overdue = open.filter((t) => t.dueDate && t.dueDate < now);
      const avgTurnaroundDays = done.length
        ? Math.round(
            (done.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) /
              done.length /
              (24 * 60 * 60 * 1000)) *
              10,
          ) / 10
        : null;
      return {
        userId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        completedCount: done.length,
        avgTurnaroundDays,
        openCount: open.length,
        overdueCount: overdue.length,
        overdueRate: open.length ? Math.round((overdue.length / open.length) * 100) : 0,
      };
    });
  }

  /**
   * Case health for the partner dashboard: pipeline by status, cases with no
   * activity beyond the firm's SLA, and cases stuck in the same status.
   */
  async getCaseHealth(user: AuthUser) {
    const now = new Date();
    const sla = await this.getSlaConfig(user);
    const inactiveSince = new Date(now.getTime() - sla.caseUpdateDays * 24 * 60 * 60 * 1000);
    const stuckSince = new Date(now.getTime() - sla.stuckStatusDays * 24 * 60 * 60 * 1000);
    const activeWhere = { firmId: user.firmId, status: { not: CaseStatus.CLOSED } };

    const [byStatus, inactiveCases, stuckCandidates] = await Promise.all([
      this.prisma.case.groupBy({
        by: ['status'],
        where: { firmId: user.firmId },
        _count: { _all: true },
      }),
      this.prisma.case.findMany({
        where: {
          ...activeWhere,
          openedAt: { lt: inactiveSince },
          activities: { none: { activityAt: { gte: inactiveSince } } },
          tasks: { none: { updatedAt: { gte: inactiveSince } } },
        },
        select: {
          id: true,
          title: true,
          status: true,
          openedAt: true,
          leadLawyer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { openedAt: 'asc' },
        take: 50,
      }),
      this.prisma.case.findMany({
        where: {
          ...activeWhere,
          openedAt: { lt: stuckSince },
          statusLogs: { none: { createdAt: { gte: stuckSince } } },
        },
        select: {
          id: true,
          title: true,
          status: true,
          openedAt: true,
          statusLogs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          leadLawyer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { openedAt: 'asc' },
        take: 50,
      }),
    ]);

    return {
      sla,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      inactiveCases,
      stuckCases: stuckCandidates.map((c) => ({
        ...c,
        inStatusSince: c.statusLogs[0]?.createdAt ?? c.openedAt,
        statusLogs: undefined,
      })),
    };
  }

  private nearestDeadlineDays(
    now: Date,
    events: { startAt: Date }[],
    tasks: { dueDate: Date | null }[],
  ): number | null {
    const dates = [
      ...events.map((e) => e.startAt),
      ...tasks.filter((t): t is { dueDate: Date } => t.dueDate !== null).map((t) => t.dueDate),
    ];
    if (!dates.length) return null;
    const nearest = dates.reduce((closest, d) =>
      Math.abs(d.getTime() - now.getTime()) < Math.abs(closest.getTime() - now.getTime())
        ? d
        : closest,
    );
    return Math.floor((nearest.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * A case's weight leans on its claimed amount (ทุนทรัพย์): a 20M-baht suit
   * is not the same load as a 50k one. Tiers, not a formula, so the number
   * stays explainable to the owner reading the dashboard.
   */
  private caseWeight(claimedAmount: number | null): number {
    const amt = claimedAmount ?? 0;
    if (amt >= 10_000_000) return 4;
    if (amt >= 1_000_000) return 3;
    if (amt >= 100_000) return 2;
    return 1;
  }

  private async getFirmMembers(firmId: string) {
    return this.prisma.user.findMany({
      where: {
        role: { in: [Role.ADMIN, Role.LAWYER] },
        firmMembers: { some: { firmId } },
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    });
  }

  async getWorkloadSummary(user: AuthUser, query: WorkloadQueryDto) {
    const nearDeadlineDays = query.nearDeadlineDays ?? 7;
    const now = new Date();
    const [cases, members] = await Promise.all([
      this.getActiveCases(user.firmId, now),
      this.getFirmMembers(user.firmId),
    ]);

    const summary = members.map((m) => {
      let leadCount = 0;
      let buddyCount = 0;
      let nearDeadlineCount = 0;
      let weightedScore = 0;
      let claimedTotal = 0;

      for (const c of cases) {
        const isLead = c.leadLawyerId === m.id;
        const isBuddy = c.assignments.some((a) => a.userId === m.id);
        if (!isLead && !isBuddy) continue;

        if (isLead) leadCount++;
        if (isBuddy) buddyCount++;
        // Lead carries the case; a buddy carries half of it.
        weightedScore += this.caseWeight(c.claimedAmount) * (isLead ? 1 : 0.5);
        claimedTotal += c.claimedAmount ?? 0;

        const days = this.nearestDeadlineDays(now, c.calendarEvents, c.tasks);
        if (days !== null && days <= nearDeadlineDays) nearDeadlineCount++;
      }

      return {
        userId: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        leadCount,
        buddyCount,
        nearDeadlineCount,
        weightedScore: Math.round(weightedScore * 10) / 10,
        claimedTotal,
        capacity: this.capacityBand(weightedScore, nearDeadlineCount),
      };
    });

    return summary.sort((a, b) => a.weightedScore - b.weightedScore);
  }

  /**
   * Capacity signal — heuristic banding on the weighted score, bumped one
   * level when many deadlines land at once.
   * ponytail: fixed thresholds; per-firm config when a second firm disagrees.
   */
  private capacityBand(
    weightedScore: number,
    nearDeadlineCount: number,
  ): 'LOW' | 'NORMAL' | 'HIGH' | 'OVERLOADED' {
    const bands = ['LOW', 'NORMAL', 'HIGH', 'OVERLOADED'] as const;
    let idx = 0;
    if (weightedScore >= 4) idx = 1;
    if (weightedScore >= 8) idx = 2;
    if (weightedScore >= 14) idx = 3;
    if (nearDeadlineCount >= 3) idx = Math.min(idx + 1, 3);
    return bands[idx];
  }

  async getWorkloadDetail(user: AuthUser, targetUserId: string, query: WorkloadQueryDto) {
    const nearDeadlineDays = query.nearDeadlineDays ?? 7;
    const now = new Date();

    const member = await this.prisma.user.findFirst({
      where: { id: targetUserId, firmMembers: { some: { firmId: user.firmId } } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!member) throw new NotFoundException('User not found');

    const cases = await this.getActiveCases(user.firmId, now);
    const held = cases
      .filter(
        (c) => c.leadLawyerId === targetUserId || c.assignments.some((a) => a.userId === targetUserId),
      )
      .map((c) => {
        const days = this.nearestDeadlineDays(now, c.calendarEvents, c.tasks);
        return {
          caseId: c.id,
          title: c.title,
          status: c.status,
          role: (c.leadLawyerId === targetUserId ? 'LEAD' : 'BUDDY') as 'LEAD' | 'BUDDY',
          nearestDeadlineDays: days,
          nearDeadline: days !== null && days <= nearDeadlineDays,
        };
      });

    return {
      userId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      cases: held,
    };
  }

  /**
   * ทีมที่ทำคดีร่วมกัน — นับตามชุดคนจริงของแต่ละคดี ไม่ใช่จับคู่ทีละสองคน
   * คดีที่มีสามคนคือทีมสามคนหนึ่งทีม ไม่ใช่คู่สามคู่ที่ดูเหมือนคนละเรื่องกัน
   */
  async getPairing(user: AuthUser) {
    const cases = await this.prisma.case.findMany({
      where: { firmId: user.firmId },
      select: {
        leadLawyerId: true,
        assignments: {
          where: { assignmentType: AssignmentType.BUDDY },
          select: { userId: true },
        },
      },
    });

    const teamCounts = new Map<string, number>();
    for (const c of cases) {
      const memberIds = [...new Set([c.leadLawyerId, ...c.assignments.map((a) => a.userId)])].sort();
      // คดีที่ทำคนเดียวไม่ใช่การทำงานร่วมกัน
      if (memberIds.length < 2) continue;
      const key = memberIds.join(':');
      teamCounts.set(key, (teamCounts.get(key) ?? 0) + 1);
    }

    if (teamCounts.size === 0) return [];

    const userIds = new Set<string>();
    for (const key of teamCounts.keys()) {
      for (const id of key.split(':')) userIds.add(id);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return [...teamCounts.entries()]
      .map(([key, count]) => {
        const memberIds = key.split(':');
        return {
          key,
          members: memberIds.map((id) => ({ id, name: nameById.get(id) ?? 'Unknown' })),
          count,
        };
      })
      .sort((a, b) => b.count - a.count || a.members.length - b.members.length);
  }

  async getOnHoldTasks(user: AuthUser) {
    const now = new Date();
    const holds = await this.prisma.taskOnHold.findMany({
      where: {
        endedAt: null,
        task: { case: { firmId: user.firmId } },
      },
      include: {
        task: {
          include: {
            case: { select: { id: true, title: true, ownRef: true } },
            assignee: { select: { firstName: true, lastName: true } },
          },
        },
        follower: { select: { firstName: true, lastName: true } },
      },
      orderBy: { nextFollowUpAt: 'asc' },
    });

    return holds.map((hold) => ({
      taskId: hold.taskId,
      taskTitle: hold.task.title,
      caseId: hold.task.case?.id ?? null,
      caseTitle: hold.task.case?.title ?? null,
      caseOwnRef: hold.task.case?.ownRef ?? null,
      assigneeName: hold.task.assignee
        ? `${hold.task.assignee.firstName} ${hold.task.assignee.lastName}`
        : null,
      reason: hold.reason,
      category: hold.category,
      startedAt: hold.startedAt,
      followerName: hold.follower
        ? `${hold.follower.firstName} ${hold.follower.lastName}`
        : null,
      lastFollowUpAt: hold.lastFollowUpAt,
      nextFollowUpAt: hold.nextFollowUpAt,
      dueDate: hold.task.dueDate,
      isOverdue: hold.task.dueDate ? hold.task.dueDate.getTime() < now.getTime() : false,
    }));
  }
}
