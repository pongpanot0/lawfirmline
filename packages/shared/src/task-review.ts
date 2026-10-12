import { FirmRole } from './firm-role';
// Runtime values from index are read at call time, so the index ⇄ module cycle is safe.
import { canAssignFirmRole, CASE_STAGE_LABELS_TH, CaseStage } from './index';

/** A handoff note shorter than this is refused on every surface (web, mobile, LINE, API). */
export const TASK_HANDOFF_NOTE_MIN = 5;

export type PlaybookSide = 'PLAINTIFF' | 'DEFENDANT';

/** Firm roles that may review any task. The case lead may review that case's tasks whatever their role. */
export const REVIEWER_FIRM_ROLES: FirmRole[] = [FirmRole.OWNER, FirmRole.SENIOR_LAWYER];

type ReviewableTask = { reviewerId?: string | null; assigneeId?: string | null; assignee?: { id: string } | null; case?: { leadLawyerId?: string | null } | null };

/** Who must review: the named reviewer, else the case lead (from the task's case or the page's case). */
export function effectiveReviewerId(task: ReviewableTask, caseLeadId?: string | null): string | null {
  return task.reviewerId ?? task.case?.leadLawyerId ?? caseLeadId ?? null;
}

/** The "รอฉันตรวจ" rule: PENDING_REVIEW AND (reviewerId = me OR (reviewerId IS NULL AND case lead = me)). */
export function awaitsReviewBy(task: ReviewableTask & { status: string }, userId: string, caseLeadId?: string | null): boolean {
  if ((task.assigneeId ?? task.assignee?.id) === userId) return false;
  return task.status === 'PENDING_REVIEW' && effectiveReviewerId(task, caseLeadId) === userId;
}

/** Whether this person may accept or return the task; mirrors the API's `assertReviewer` exactly. */
export function canActOnReview(
  task: { status: string; reviewerId?: string | null; assigneeId?: string | null; caseId?: string | null; leadLawyerId?: string | null },
  userId: string,
  firmRole: string | null | undefined,
): boolean {
  if (task.status !== 'PENDING_REVIEW' || task.assigneeId === userId || firmRole === FirmRole.OFFICE_MANAGER) return false;
  if (task.reviewerId) return task.reviewerId === userId;
  return task.leadLawyerId === userId || (!!task.caseId && firmRole === FirmRole.OWNER);
}

export function isEligibleReviewer(p: { role: string | null | undefined; userId: string; caseLeadId?: string | null; assigneeId?: string | null }): boolean {
  if (p.assigneeId && p.userId === p.assigneeId) return false;
  if (p.role === FirmRole.OFFICE_MANAGER) return false;
  if (p.caseLeadId && p.userId === p.caseLeadId) return true;
  return REVIEWER_FIRM_ROLES.includes(p.role as FirmRole);
}

/** Rank rule for handing work to someone else; a LAWYER may also hand work to an ASSISTANT or the OFFICE_MANAGER. */
export function canDelegateTask(assigner: FirmRole, assignee: FirmRole): boolean {
  if (assigner === FirmRole.LAWYER) return assignee === FirmRole.ASSISTANT || assignee === FirmRole.OFFICE_MANAGER;
  return canAssignFirmRole(assigner, assignee);
}

/** The side of the dispute our client is on; petitioner files like a plaintiff, respondent answers like a defendant. */
export function partySide(partyRole: string | null | undefined): PlaybookSide | null {
  if (partyRole === 'PLAINTIFF' || partyRole === 'PETITIONER') return 'PLAINTIFF';
  if (partyRole === 'DEFENDANT' || partyRole === 'RESPONDENT') return 'DEFENDANT';
  return null;
}

const INTERNAL_LABEL = /^(stage|playbook):/;

/** `stage:*` and `playbook:*` stay in data for queries but never render. */
export function visibleTaskLabels(labels: string[] | null | undefined): string[] {
  return (labels ?? []).filter((label) => !INTERNAL_LABEL.test(label));
}

export function taskStageChip(labels: string[] | null | undefined): string | null {
  const stage = (labels ?? []).find((label) => label.startsWith('stage:'))?.slice('stage:'.length);
  const name = stage ? CASE_STAGE_LABELS_TH[stage as CaseStage] : undefined;
  return name ? `ขั้น: ${name}` : null;
}
