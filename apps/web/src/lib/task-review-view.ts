import { TASK_HANDOFF_NOTE_MIN } from '@lawfirm/shared';

type Person = { id: string; firstName: string; lastName?: string | null };
type ReviewTask = {
  status: string;
  assignee?: Person | null;
  reviewer?: Person | null;
  onHold?: { reason: string; endedAt: string | null } | null;
};

const fullName = (p: Person) => `${p.firstName} ${p.lastName ?? ''}`.trim();

/** My own work handed in and waiting — listed under "รอตรวจ", never under "รอฉันตรวจ". */
export function submittedByMe(task: ReviewTask, userId: string): boolean {
  return task.status === 'PENDING_REVIEW' && task.assignee?.id === userId;
}

/** "ส่งให้ {name} ตรวจ": the named reviewer, else the case lead. */
export function reviewerName(task: ReviewTask, caseLead?: Person | null): string | null {
  const reviewer = task.reviewer ?? caseLead;
  return reviewer ? fullName(reviewer) : null;
}

export function isHeld(task: ReviewTask): boolean {
  return !!task.onHold && !task.onHold.endedAt;
}

export function handoffNoteError(note: string): string | null {
  return note.trim().length >= TASK_HANDOFF_NOTE_MIN ? null : `เขียนหมายเหตุถึงผู้ตรวจอย่างน้อย ${TASK_HANDOFF_NOTE_MIN} ตัวอักษร`;
}
