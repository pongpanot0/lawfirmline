import { Injectable } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

/** A projection of existing work. Opening this queue never creates tasks. */
@Injectable()
export class ActionCenterService {
  constructor(private prisma: PrismaService, private access: CaseAccessService) {}

  async list(user: AuthUser) {
    const activeCase = { AND: [this.access.getCaseFilterForUser(user), { status: { not: 'CLOSED' as const } }] };
    const intakeScope = await this.access.getIntakeFilterForUser(user);
    const taskScope = {
      AND: [this.access.getTaskFilterForUser(user), {
        OR: [
          { case: activeCase },
          { caseId: null, assigneeId: user.id, assignee: { firmMembers: { some: { firmId: user.firmId } } } },
        ],
      }],
    };
    const [tasks, dates, reviews, drafts, events, intakes] = await Promise.all([
      this.prisma.task.findMany({
        where: { ...taskScope, status: { not: 'DONE' }, OR: [{ assigneeId: null }, { onHold: { endedAt: null } }] },
        include: { case: { select: { ownRef: true } }, assignee: { select: { firstName: true, lastName: true } }, onHold: true },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], take: 50,
      }),
      this.prisma.documentDateSuggestion.findMany({
        where: { status: 'PENDING', case: activeCase }, include: { case: { select: { ownRef: true, leadLawyerId: true, leadLawyer: { select: { firstName: true, lastName: true } } } } },
        orderBy: [{ suggestedDate: 'asc' }, { id: 'asc' }], take: 50,
      }),
      this.prisma.reviewRound.findMany({
        where: { status: 'WAITING_REVIEW', reviewerIds: { has: user.id }, decisions: { none: { reviewerId: user.id } }, documentVersion: { document: { case: activeCase } } },
        include: { documentVersion: { include: { document: { select: { id: true, caseId: true, filename: true } } } } },
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }], take: 50,
      }),
      this.prisma.closingEmailDraft.findMany({
        where: { status: 'DRAFT', case: activeCase }, include: { case: { select: { ownRef: true } }, createdBy: { select: { firstName: true, lastName: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50,
      }),
      this.prisma.calendarEvent.findMany({
        where: { case: activeCase, startAt: { lte: new Date(Date.now() + 48 * 3600000), gte: new Date(Date.now() - 90 * 86400000) }, NOT: { courtDay: { completedAt: { not: null } } } },
        include: { responsibility: true, assignee: { select: { firstName: true, lastName: true } }, case: { select: { ownRef: true, leadLawyerId: true, leadLawyer: { select: { firstName: true, lastName: true } } } } },
        orderBy: [{ startAt: 'asc' }, { id: 'asc' }], take: 50,
      }),
      this.prisma.intake.findMany({
        where: {
          ...intakeScope,
          stage: { not: 'CLOSED' },
          status: { notIn: ['NO_RESPONSE', 'REJECTED', 'CONVERTED'] },
          nextFollowUpAt: { not: null },
        },
        include: { followUpOwner: { select: { firstName: true, lastName: true } } },
        orderBy: [{ nextFollowUpAt: 'asc' }, { id: 'asc' }], take: 50,
      }),
    ]);
    const name = (person: { firstName: string; lastName: string } | null) => person ? `${person.firstName} ${person.lastName}` : null;
    const rows = [
      ...events.filter(e => !(e.responsibility?.acceptedAt && e.responsibility.ownerId === (e.assigneeId ?? e.case.leadLawyerId) && e.responsibility.eventUpdatedAt.getTime() === e.updatedAt.getTime())).map(e => ({ id: `ack:${e.id}`, kind: 'ACKNOWLEDGEMENT', title: e.title, detail: null, caseRef: e.case.ownRef, owner: name(e.assignee ?? e.case.leadLawyer), ownerId: e.assigneeId ?? e.case.leadLawyerId, dueAt: e.startAt.toISOString(), url: `/cases/${e.caseId}?tab=calendar&eventId=${e.id}` })),
      ...tasks.map(t => ({ id: `task:${t.id}`, kind: t.onHold && !t.onHold.endedAt ? 'WAITING' : 'UNASSIGNED', title: t.title, detail: t.onHold?.reason ?? null, caseRef: t.case?.ownRef ?? null, owner: name(t.assignee), ownerId: t.assigneeId, dueAt: t.onHold?.nextFollowUpAt?.toISOString() ?? t.dueDate?.toISOString() ?? null, url: t.caseId ? `/cases/${t.caseId}/tasks` : '/todos' })),
      ...dates.map(s => ({ id: `date:${s.id}`, kind: 'DATE_REVIEW', title: s.label, detail: s.sourceExcerpt, caseRef: s.case.ownRef, owner: name(s.case.leadLawyer), ownerId: s.case.leadLawyerId, dueAt: s.suggestedDate.toISOString(), url: `/cases/${s.caseId}/calendar` })),
      ...reviews.map(r => ({ id: `review:${r.id}`, kind: 'DOCUMENT_REVIEW', title: r.documentVersion.document.filename, detail: r.scope, caseRef: null, owner: name(user), ownerId: user.id, dueAt: r.dueAt?.toISOString() ?? null, url: `/cases/${r.documentVersion.document.caseId}/documents` })),
      ...drafts.map(d => ({ id: `draft:${d.id}`, kind: 'CLIENT_DRAFT', title: d.subject, detail: null, caseRef: d.case.ownRef, owner: name(d.createdBy), ownerId: d.createdById, dueAt: null, url: `/cases/${d.caseId}?tab=closing-report&draftId=${d.id}` })),
      ...intakes.map(i => ({ id: `intake:${i.id}`, kind: 'INTAKE_FOLLOW_UP', title: i.title ?? i.insurerName ?? i.claimNumber ?? i.customerRef ?? '', detail: i.insurerName, caseRef: i.claimNumber ?? i.customerRef, owner: name(i.followUpOwner), ownerId: i.followUpOwnerId, dueAt: i.nextFollowUpAt!.toISOString(), url: `/intake/${i.id}` })),
    ];
    rows.sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.id.localeCompare(b.id));
    return { items: rows, limited: [tasks, dates, reviews, drafts, events, intakes].some(group => group.length === 50) };
  }
}
