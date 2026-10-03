import { TaskStatus, TaskWorkType, taskPoints, followUpReason, updatedOn } from '@lawfirm/shared';
import type { DailyWorkMember, DailyWorkTask } from '@lawfirm/shared';
export { daysLate, followUpReason, updatedOn } from '@lawfirm/shared';

export const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', SENIOR_LAWYER: 'ทนายอาวุโส', LAWYER: 'ทนาย', ASSISTANT: 'ผู้ช่วย' };

export const bangkokDay = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));

/** The day a task sits on in the radar: its planned day, else its deadline's Bangkok day (mirrors the API). */
export function taskDayKey(t: { scheduledFor: string | null; dueDate: string | null }) {
  return t.scheduledFor?.slice(0, 10) ?? (t.dueDate ? bangkokDay(t.dueDate) : null);
}
export function needsOwner(task: DailyWorkTask, date: string) {
  return followUpReason(task, date) !== null;
}

/** Reasons are observed queue data, not estimates of spare hours. */
export function assignmentCandidates(members: DailyWorkMember[], tasks: DailyWorkTask[], workType: TaskWorkType, date: string) {
  return members.map((member) => {
    const queue = tasks.filter((t) => t.workerId === member.userId && ![TaskStatus.DONE, TaskStatus.PENDING_REVIEW].includes(t.status as TaskStatus));
    const configured = member.workTypes.includes(workType);
    const unknown = queue.some((t) => !updatedOn(t, date));
    const reviews = tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW && t.assigneeId === member.userId);
    const points = queue.reduce((sum, t) => sum + taskPoints(t.size), 0);
    return { member, queue, points, reviews, configured, unknown };
  }).sort((a, b) => Number(a.member.onLeave) - Number(b.member.onLeave) || Number(b.configured) - Number(a.configured) || Number(a.unknown) - Number(b.unknown) || a.points - b.points);
}
