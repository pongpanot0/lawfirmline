import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, AssignmentType, CaseStatus, Role, TaskStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { WorkloadQueryDto } from './dto/operations.dto';

interface ActiveCaseRow {
  id: string;
  title: string;
  status: string;
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

      for (const c of cases) {
        const isLead = c.leadLawyerId === m.id;
        const isBuddy = c.assignments.some((a) => a.userId === m.id);
        if (!isLead && !isBuddy) continue;

        if (isLead) leadCount++;
        if (isBuddy) buddyCount++;

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
      };
    });

    return summary.sort((a, b) => a.leadCount + a.buddyCount - (b.leadCount + b.buddyCount));
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
        };
      });

    void nearDeadlineDays; // reserved for a future "highlight near-deadline rows" UI need

    return {
      userId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      cases: held,
    };
  }

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

    const pairCounts = new Map<string, number>();
    for (const c of cases) {
      const participantIds = [...new Set([c.leadLawyerId, ...c.assignments.map((a) => a.userId)])];
      for (let i = 0; i < participantIds.length; i++) {
        for (let j = i + 1; j < participantIds.length; j++) {
          const key = [participantIds[i], participantIds[j]].sort().join(':');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    if (pairCounts.size === 0) return [];

    const userIds = new Set<string>();
    for (const key of pairCounts.keys()) {
      const [a, b] = key.split(':');
      userIds.add(a);
      userIds.add(b);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    return [...pairCounts.entries()]
      .map(([key, count]) => {
        const [userAId, userBId] = key.split(':');
        return {
          userAId,
          userAName: nameById.get(userAId) ?? 'Unknown',
          userBId,
          userBName: nameById.get(userBId) ?? 'Unknown',
          count,
        };
      })
      .sort((a, b) => b.count - a.count);
  }
}
