import { ReviewQueueItem, TaskStatus } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';

/** PENDING_REVIEW AND (reviewerId = me OR (reviewerId IS NULL AND case.leadLawyerId = me)), inside my firm, never my own work. */
export function reviewQueueWhere(user: { id: string; firmId: string }): Prisma.TaskWhereInput {
  return {
    status: TaskStatus.PENDING_REVIEW,
    AND: [
      { OR: [
        { firmId: user.firmId },
        { case: { firmId: user.firmId } },
        // Legacy standalone rows predate Task.firmId; the creator's membership scopes them.
        { firmId: null, caseId: null, createdBy: { firmMembers: { some: { firmId: user.firmId } } } },
      ] },
      { OR: [{ assigneeId: null }, { assigneeId: { not: user.id } }] },
      { OR: [{ reviewerId: user.id, OR: [{ caseId: null }, { case: { deletedAt: null } }] }, { reviewerId: null, case: { leadLawyerId: user.id, deletedAt: null } }] },
    ],
  };
}

export const reviewQueueSelect = {
  id: true, title: true, caseId: true, dueDate: true, submittedAt: true,
  case: { select: { id: true, ownRef: true, title: true } },
  assignee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TaskSelect;

type ReviewQueueRow = {
  id: string; title: string; caseId: string | null; dueDate: Date | null; submittedAt: Date | null;
  case: { id: string; ownRef: string; title: string } | null;
  assignee: { id: string; firstName: string; lastName: string } | null;
};

export function toReviewQueueItem(row: ReviewQueueRow): ReviewQueueItem {
  return {
    id: row.id,
    title: row.title,
    caseId: row.caseId,
    caseRef: row.case?.ownRef ?? null,
    caseTitle: row.case?.title ?? null,
    workerName: row.assignee ? `${row.assignee.firstName} ${row.assignee.lastName}` : null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
  };
}

/** Oldest hand-in first: the reviewer clears what has waited longest. */
export const reviewQueueOrder: Prisma.TaskOrderByWithRelationInput[] = [{ submittedAt: 'asc' }, { createdAt: 'asc' }];
