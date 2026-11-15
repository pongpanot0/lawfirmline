/** Where an open task is waiting. Order = how strongly it points at a bottleneck outside the worker's own pace. */
export type WorkStage = 'unacknowledged' | 'blocked' | 'on_hold' | 'needs_revision' | 'pending_review' | 'not_started' | 'in_progress';

export const WORK_STAGES: { value: WorkStage; label: string }[] = [
  { value: 'unacknowledged', label: 'ยังไม่รับงาน' },
  { value: 'blocked', label: 'รองานอื่นเสร็จ' },
  { value: 'on_hold', label: 'พักงานไว้' },
  { value: 'needs_revision', label: 'ต้องแก้ไข' },
  { value: 'pending_review', label: 'รอตรวจ' },
  { value: 'not_started', label: 'ยังไม่เริ่ม' },
  { value: 'in_progress', label: 'กำลังทำ' },
];

export interface WorkSummaryTask {
  id: string; title: string; status: string; caseRef: string | null;
  createdAt: Date; assignedAt: Date | null; acknowledgedAt: Date | null; submittedAt: Date | null;
  dueDate: Date | null; completedAt: Date | null; onHold: boolean; blocked: boolean;
}

export interface WorkSummaryWeek { weekStart: string; closed: number; added: number; open: number; overdue: number }
export interface WorkSummaryStage { stage: WorkStage; label: string; count: number; avgDays: number; oldestDays: number }
export interface WorkSummaryStuckTask { id: string; title: string; caseRef: string | null; stage: WorkStage; label: string; days: number; overdue: boolean }
export interface MemberWorkSummary {
  userId: string; firstName: string; lastName: string; role: string;
  weeks: WorkSummaryWeek[]; stages: WorkSummaryStage[]; stuck: WorkSummaryStuckTask[];
}

const DAY_MS = 86400000;
const label = (stage: WorkStage) => WORK_STAGES.find((s) => s.value === stage)!.label;

export function workStage(t: Pick<WorkSummaryTask, 'status' | 'assignedAt' | 'acknowledgedAt' | 'onHold' | 'blocked'>): WorkStage {
  if (t.status === 'PENDING_REVIEW') return 'pending_review';
  if (t.status === 'NEEDS_REVISION') return 'needs_revision';
  if (t.onHold) return 'on_hold';
  if (t.blocked) return 'blocked';
  if (t.assignedAt && !t.acknowledgedAt) return 'unacknowledged';
  return t.status === 'IN_PROGRESS' ? 'in_progress' : 'not_started';
}

/** When the task started waiting at its stage: hand-in for review, otherwise when it reached the worker. */
const waitingSince = (t: WorkSummaryTask) => (t.status === 'PENDING_REVIEW' && t.submittedAt) || t.assignedAt || t.createdAt;
const arrived = (t: WorkSummaryTask) => t.assignedAt ?? t.createdAt;

/**
 * Weekly trend + where open work waits, for one member.
 * `weekStarts` are consecutive week starts (oldest first); each week runs until the next one, the last until `now`.
 * Legacy DONE tasks without completedAt are left out of every week.
 * ponytail: tasks are counted for their current assignee only; reassignment history (TaskAssignmentLog) is ignored.
 */
export function buildWorkSummary(tasks: WorkSummaryTask[], weekStarts: Date[], now: Date): Pick<MemberWorkSummary, 'weeks' | 'stages' | 'stuck'> {
  const known = tasks.filter((t) => t.status !== 'DONE' || t.completedAt);
  const weeks = weekStarts.map((start, i) => {
    const end = i + 1 < weekStarts.length ? weekStarts[i + 1] : now;
    const openAt = known.filter((t) => arrived(t) < end && (!t.completedAt || t.completedAt >= end));
    return {
      weekStart: start.toISOString(),
      closed: known.filter((t) => t.completedAt && t.completedAt >= start && t.completedAt < end).length,
      added: known.filter((t) => arrived(t) >= start && arrived(t) < end).length,
      open: openAt.length,
      overdue: openAt.filter((t) => t.dueDate && t.dueDate < end).length,
    };
  });
  const open = known.filter((t) => t.status !== 'DONE').map((t) => {
    const stage = workStage(t);
    return { id: t.id, title: t.title, caseRef: t.caseRef, stage, label: label(stage), days: Math.max(0, Math.floor((now.getTime() - waitingSince(t).getTime()) / DAY_MS)), overdue: !!t.dueDate && t.dueDate < now };
  });
  const stages = WORK_STAGES.map(({ value }) => {
    const mine = open.filter((t) => t.stage === value);
    return { stage: value, label: label(value), count: mine.length,
      avgDays: mine.length ? Math.round(mine.reduce((sum, t) => sum + t.days, 0) / mine.length) : 0,
      oldestDays: Math.max(0, ...mine.map((t) => t.days)) };
  });
  const stuck = [...open].sort((a, b) => b.days - a.days).slice(0, 5);
  return { weeks, stages, stuck };
}
