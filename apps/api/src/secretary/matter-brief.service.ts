import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma';
import type { AuthUser, MatterBrief, MatterTaskItem } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { bangkokDaysBetween, lastMovementAt, rankStuck, type StuckTaskRow } from './stuck';

const DAY_MS = 86_400_000;
const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : null);

@Injectable()
export class MatterBriefService {
  constructor(private readonly prisma: PrismaService, private readonly access: CaseAccessService) {}

  async getCaseBrief(user: AuthUser, caseId: string): Promise<MatterBrief | null> {
    const filter = await this.access.getCaseFilterForUser(user);
    const c = await this.prisma.case.findFirst({
      where: { AND: [filter, { id: caseId }] },
      include: {
        participants: { orderBy: { createdAt: 'asc' } },
        intake: true,
        leadLawyer: { select: { firstName: true, lastName: true } },
      },
    });
    if (!c) return null;
    const now = new Date();
    const [activities, statusLogs, nextEvent, rows] = await Promise.all([
      this.prisma.caseActivity.findMany({ where: { caseId }, orderBy: { activityAt: 'desc' }, take: 3, select: { title: true, activityAt: true } }),
      this.prisma.caseStatusLog.findMany({ where: { caseId }, orderBy: { createdAt: 'desc' }, take: 3, select: { toStatus: true, toStage: true, createdAt: true } }),
      this.prisma.calendarEvent.findFirst({
        where: { caseId, startAt: { gte: now } }, orderBy: { startAt: 'asc' },
        select: { id: true, startAt: true, title: true, type: true, courtName: true },
      }),
      this.loadOpenTaskRows({ caseId, status: { not: 'DONE' } }, now),
    ]);

    const recentEvents = [
      ...activities.map((a) => ({ at: a.activityAt, title: a.title })),
      ...statusLogs.map((s) => ({ at: s.createdAt, title: `สถานะ: ${s.toStatus}${s.toStage ? ` / ขั้น: ${s.toStage}` : ''}` })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 3).map((e) => ({ at: e.at.toISOString(), title: e.title }));

    const parties = c.participants;
    const isCounsel = (p: (typeof parties)[number]) => p.role === 'OPPOSING_LAWYER';
    return {
      kind: 'case', id: c.id, title: c.title, ownRef: c.ownRef,
      clientName: c.clientName, partyRole: c.partyRole,
      ourParties: parties.filter((p) => p.side === 'OURS').map((p) => p.name),
      opponents: parties.filter((p) => p.side === 'OPPONENT' && !isCounsel(p)).map((p) => ({ name: p.name, role: p.role })),
      opposingCounsel: [...new Set([
        ...parties.filter((p) => p.opposingLawyer).map((p) => p.opposingLawyer as string),
        ...parties.filter(isCounsel).map((p) => p.name),
      ])],
      courtName: c.courtName, blackCaseNumber: c.blackCaseNumber, redCaseNumber: c.redCaseNumber,
      claimedAmount: c.claimedAmount ?? null,
      assessment: c.intake
        ? { decision: c.intake.decision, caseStrength: c.intake.caseStrength, notes: c.intake.assessmentNotes, estimatedDamage: c.intake.estimatedDamage }
        : null,
      status: c.status, stage: c.stage, stageChangedAt: c.stageChangedAt?.toISOString() ?? null,
      recentEvents,
      nextEvent: nextEvent
        ? { id: nextEvent.id, at: nextEvent.startAt.toISOString(), title: nextEvent.title, type: nextEvent.type, courtName: nextEvent.courtName }
        : null,
      openTasks: this.toItems(rows),
      leadLawyerName: fullName(c.leadLawyer),
    };
  }

  async getIntakeBrief(user: AuthUser, intakeId: string): Promise<MatterBrief | null> {
    const filter = await this.access.getIntakeFilterForUser(user);
    const i = await this.prisma.intake.findFirst({
      where: { AND: [filter, { id: intakeId }] },
      include: { assessor: { select: { firstName: true, lastName: true } } },
    });
    if (!i) return null;
    const rows = await this.loadOpenTaskRows({ intakeId, status: { not: 'DONE' } }, new Date());
    return {
      kind: 'intake', id: i.id, title: i.title ?? i.clientName ?? '', ownRef: null,
      clientName: i.clientName, partyRole: i.partyRole,
      ourParties: [], opponents: i.opposingParty ? [{ name: i.opposingParty, role: 'OPPONENT' }] : [], opposingCounsel: [],
      courtName: null, blackCaseNumber: null, redCaseNumber: null, claimedAmount: null,
      assessment: { decision: i.decision, caseStrength: i.caseStrength, notes: i.assessmentNotes, estimatedDamage: i.estimatedDamage },
      status: i.status, stage: i.stage, stageChangedAt: i.stageChangedAt.toISOString(),
      recentEvents: [], nextEvent: null,
      openTasks: this.toItems(rows),
      leadLawyerName: fullName(i.assessor),
    };
  }

  private toItems(rows: StuckTaskRow[]): MatterTaskItem[] {
    return [...rows]
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.daysStuck - a.daysStuck)
      .map((r) => ({
        id: r.taskId, title: r.title, status: r.status, assigneeName: r.assigneeName,
        dueDate: r.dueDate?.toISOString() ?? null, daysStuck: r.daysStuck, daysOverdue: r.daysOverdue, holdReason: r.holdReason,
      }));
  }

  /** Generic over `where` (Task 5 passes a firm-scoped one). Task rows + two lookups (audit dates, imminent hearings). */
  async loadOpenTaskRows(where: Prisma.TaskWhereInput, now: Date): Promise<StuckTaskRow[]> {
    const tasks = await this.prisma.task.findMany({
      where,
      select: {
        id: true, title: true, status: true, caseId: true, intakeId: true, dueDate: true,
        createdAt: true, assignedAt: true, acknowledgedAt: true, planConfirmedAt: true, submittedAt: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        case: { select: { title: true } }, intake: { select: { title: true, clientName: true } },
        assignmentLogs: { select: { createdAt: true } },
        onHold: { select: { reason: true, endedAt: true, nextFollowUpAt: true } },
      },
    });
    if (!tasks.length) return [];
    const ids = tasks.map((t) => t.id);
    const caseIds = [...new Set(tasks.map((t) => t.caseId).filter((x): x is string => !!x))];
    // ponytail: JSON-path OR per task id; swap for a raw query / indexed taskId column if firm-wide scans get slow
    const [audits, hearings] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { action: 'TASK_CHANGED', OR: ids.map((id) => ({ metadata: { path: ['taskId'], equals: id } })) },
        select: { metadata: true, createdAt: true },
      }),
      caseIds.length
        ? this.prisma.calendarEvent.findMany({
            where: { caseId: { in: caseIds }, type: { in: ['COURT_DATE', 'DEADLINE'] }, startAt: { gte: now, lte: new Date(now.getTime() + 7 * DAY_MS) } },
            select: { caseId: true },
          })
        : Promise.resolve([]),
    ]);
    const auditByTask = new Map<string, Date[]>();
    for (const a of audits) {
      const id = (a.metadata as { taskId?: string } | null)?.taskId;
      if (id) auditByTask.set(id, [...(auditByTask.get(id) ?? []), a.createdAt]);
    }
    const hearingCases = new Set(hearings.map((h) => h.caseId));

    return tasks.map((t) => {
      const openHold = t.onHold && !t.onHold.endedAt ? t.onHold : null;
      const moved = lastMovementAt({ ...t, assignmentLogDates: t.assignmentLogs.map((l) => l.createdAt), changeAuditDates: auditByTask.get(t.id) ?? [] });
      return {
        taskId: t.id, title: t.title, status: t.status, caseId: t.caseId, intakeId: t.intakeId,
        matterTitle: t.case?.title ?? t.intake?.title ?? t.intake?.clientName ?? '',
        assigneeId: t.assignee?.id ?? null, assigneeName: fullName(t.assignee),
        dueDate: t.dueDate, daysStuck: Math.max(0, bangkokDaysBetween(moved, now)),
        daysOverdue: t.dueDate ? Math.max(0, bangkokDaysBetween(t.dueDate, now)) : 0,
        holdReason: openHold?.reason ?? null,
        holdFollowUpOverdue: !!openHold?.nextFollowUpAt && openHold.nextFollowUpAt < now,
        hearingWithin7Days: !!t.caseId && hearingCases.has(t.caseId),
      };
    });
  }
}
