import { TaskStatus, TaskWorkType, taskPoints } from '@lawfirm/shared';
import type { DailyWorkMember, DailyWorkTask } from '@lawfirm/shared';

export const ROLE_LABELS: Record<string, string> = { OWNER: 'Owner', SENIOR_LAWYER: 'ทนายอาวุโส', LAWYER: 'ทนาย', ASSISTANT: 'ผู้ช่วย' };

export function updatedOn(task: DailyWorkTask, date: string) {
  return !!task.latestUpdate && task.latestUpdate.authorId === task.workerId && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(task.latestUpdate.createdAt)) === date;
}

export const bangkokDay = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(iso));

/** The day a task sits on in the radar: its planned day, else its deadline's Bangkok day (mirrors the API). */
export function taskDayKey(t: { scheduledFor: string | null; dueDate: string | null }) {
  return t.scheduledFor?.slice(0, 10) ?? (t.dueDate ? bangkokDay(t.dueDate) : null);
}
const notSubmitted = (task: DailyWorkTask) => ![TaskStatus.DONE, TaskStatus.PENDING_REVIEW].includes(task.status as TaskStatus);

/** Days past the deadline as of `date` (0 = due that day), or null when not due yet / already handed in. */
export function daysLate(task: DailyWorkTask, date: string) {
  if (!task.dueDate || !task.assigneeId || !notSubmitted(task)) return null;
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${bangkokDay(task.dueDate)}T00:00:00Z`)) / 86400000);
  return diff >= 0 ? diff : null;
}

/** Why the owner should look at this task on `date`, most urgent first; null when nothing needs them. */
export function followUpReason(task: DailyWorkTask, date: string): string | null {
  if (task.status === TaskStatus.DONE) return null;
  const late = daysLate(task, date);
  if (task.holdReason) return `พักไว้: ${task.holdReason}`;
  if (task.blocker) return `ติด: ${task.blocker}`;
  if (task.blockedBy) return `รอ "${task.blockedBy}" เสร็จก่อน`;
  if (late !== null) return late === 0 ? 'ครบกำหนดวันนี้ ยังไม่ส่ง' : `เลยกำหนด ${late} วัน ยังไม่ส่ง`;
  if (task.status === TaskStatus.PENDING_REVIEW) return 'รอตรวจ';
  if (task.assignedAt && !task.acknowledgedAt) return 'ยังไม่รับทราบงาน';
  if (task.workerId && task.scheduledFor?.slice(0, 10) === date && !updatedOn(task, date)) return 'วางแผนทำวันนี้ ยังไม่อัปเดต';
  return null;
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
