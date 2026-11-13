import { awaitsReviewBy } from './task-review';
export enum TaskWorkType {
  TRANSCRIPTION = 'TRANSCRIPTION',
  DOCUMENTS = 'DOCUMENTS',
  DRAFTING = 'DRAFTING',
  RESEARCH = 'RESEARCH',
  COURT = 'COURT',
  GENERAL = 'GENERAL',
}

export const TASK_WORK_TYPES = [
  { value: TaskWorkType.TRANSCRIPTION, label: 'ถอดเทป' },
  { value: TaskWorkType.DOCUMENTS, label: 'ตรวจ / จัดเอกสาร' },
  { value: TaskWorkType.DRAFTING, label: 'ร่างเอกสารกฎหมาย' },
  { value: TaskWorkType.RESEARCH, label: 'ค้นคว้าข้อกฎหมาย' },
  { value: TaskWorkType.COURT, label: 'งานศาล' },
  { value: TaskWorkType.GENERAL, label: 'งานทั่วไป' },
] as const;

export enum TaskSize {
  S = 'S',
  M = 'M',
  L = 'L',
}

export const TASK_SIZES = [
  { value: TaskSize.S, label: 'เล็ก (ไม่เกินครึ่งวัน)' },
  { value: TaskSize.M, label: 'กลาง (ราว 1 วัน)' },
  { value: TaskSize.L, label: 'ใหญ่ (หลายวัน)' },
] as const;

const TASK_SIZE_POINTS: Record<TaskSize, number> = { S: 1, M: 2, L: 4 };

/** Load points for one task. */
export function taskPoints(size: TaskSize | `${TaskSize}`) {
  return TASK_SIZE_POINTS[size as TaskSize];
}

/** Office default queue standard, used until a member has enough finished work to set their own. */
export const HEAVY_QUEUE_POINTS = 10;
export const HEAVY_DAY_POINTS = 4;
/** Weeks of finished work behind a member's personal standard. */
export const STANDARD_HISTORY_WEEKS = 8;

/**
 * A member's queue standard = points they actually finished per week over the last STANDARD_HISTORY_WEEKS weeks,
 * so a fast lawyer can carry more than 10 and a slower one is flagged earlier.
 * Too little history (fewer than 5 finished tasks) keeps the office default. Clamped to 5–30 so one odd stretch can't make it absurd.
 * ponytail: leave weeks count as zero-output weeks; exclude them if standards dip after long leave.
 */
export function personalStandard(finished: { points: number; count: number }) {
  if (finished.count < 5) return HEAVY_QUEUE_POINTS;
  return Math.min(30, Math.max(5, Math.round(finished.points / STANDARD_HISTORY_WEEKS)));
}

/** The one queue rule every screen uses: over = above the standard, near = 80% of it or more. */
export function queueLoad(points: number, standard = HEAVY_QUEUE_POINTS): 'over' | 'near' | 'ok' {
  return points > standard ? 'over' : points >= standard * 0.8 ? 'near' : 'ok';
}

/** The one day rule every screen uses: over = above HEAVY_DAY_POINTS, busy = above half of it. */
export function dayLoad(points: number): 'over' | 'busy' | 'ok' {
  return points > HEAVY_DAY_POINTS ? 'over' : points > HEAVY_DAY_POINTS / 2 ? 'busy' : 'ok';
}

export type WorkloadStatus = 'over_standard' | 'near_standard' | 'on_leave_this_week' | 'has_overdue' | 'free';

/** Status badge for one team-radar member. Someone with overdue work is never "free", whatever their points. */
export function workloadStatus(member: { openPoints: number; standardPoints: number; overdueCount: number; days: { onLeave: boolean }[] }): WorkloadStatus {
  const load = queueLoad(member.openPoints, member.standardPoints);
  if (load !== 'ok') return load === 'over' ? 'over_standard' : 'near_standard';
  if (member.days.some((d) => d.onLeave)) return 'on_leave_this_week';
  return member.overdueCount > 0 ? 'has_overdue' : 'free';
}

type WorkloadMember = Parameters<typeof workloadStatus>[0];
const workloadUrgency = (m: WorkloadMember) => {
  const status = workloadStatus(m);
  if (status === 'over_standard') return 0;
  if (m.overdueCount > 0) return 1;
  return { near_standard: 2, has_overdue: 1, free: 3, on_leave_this_week: 4 }[status];
};

/** Team-radar order: over standard, then overdue, near standard, free, on leave; more overdue, then fuller (points vs own standard) first within a group. */
export function compareWorkload(a: WorkloadMember, b: WorkloadMember) {
  return workloadUrgency(a) - workloadUrgency(b) || b.overdueCount - a.overdueCount || b.openPoints / b.standardPoints - a.openPoints / a.standardPoints;
}

export type DailyTaskUpdateInput = { completed: string; remaining: string; blocker?: string };

export function dailyTaskUpdateText(input: DailyTaskUpdateInput) {
  return `ทำถึงไหน: ${input.completed.trim()}\nเหลืออะไร: ${input.remaining.trim()}\nติดอะไร: ${input.blocker?.trim() || 'ไม่มี'}`;
}

export interface DailyWorkTask {
  id: string; title: string; status: string; priority: string;
  assigneeId: string | null; workerId: string | null; reviewerId: string | null;
  caseId: string | null; case: { id: string; ownRef: string; title: string; leadLawyerId?: string } | null;
  workType: TaskWorkType | null; size: TaskSize; dueDate: string | null; scheduledFor: string | null;
  queuePosition: number; requiresReview: boolean; assignedAt: string | null; acknowledgedAt: string | null;
  completedAt: string | null; holdReason: string | null; blockedBy: string | null;
  blocker: string | null; planConfirmedAt: string | null; followedUpAt: string | null;
  latestUpdate: { body: string; createdAt: string; authorName: string; authorId: string } | null;
}

export interface DailyWorkMember {
  userId: string; firstName: string; lastName: string; email: string; role: string;
  workTypes: TaskWorkType[]; onLeave: boolean; standardPoints: number;
  appointments: { id: string; title: string; startAt: string; endAt: string | null }[];
}

export interface DailyWorkboard {
  date: string; fetchedAt: string; members: DailyWorkMember[]; tasks: DailyWorkTask[];
  cases: { id: string; ownRef: string; title: string }[];
}

export function updatedOn(task: DailyWorkTask, date: string) {
  return !!task.latestUpdate && task.latestUpdate.authorId === task.workerId &&
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(task.latestUpdate.createdAt)) === date;
}

export function taskDayKey(task: { scheduledFor: string | null; dueDate: string | null }) {
  return task.scheduledFor?.slice(0, 10) ?? (task.dueDate ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(task.dueDate)) : null);
}

/** Observed work, never an estimate of free hours. A missing report stays unknown. */
export function assignmentCandidates(members: DailyWorkMember[], tasks: DailyWorkTask[], workType: TaskWorkType, date: string) {
  return members.map(member => {
    const queue = tasks.filter(t => t.workerId === member.userId && !['DONE', 'PENDING_REVIEW'].includes(t.status));
    const unknownCount = queue.filter(t => !updatedOn(t, date)).length;
    return {
      member, queue, unknown: unknownCount > 0, unknownCount,
      points: queue.reduce((sum, t) => sum + taskPoints(t.size), 0),
      reviews: tasks.filter(t => awaitsReviewBy(t, member.userId, t.case?.leadLawyerId)),
      configured: member.workTypes.includes(workType),
      today: queue.filter(t => taskDayKey(t) === date),
      done: tasks.filter(t => t.workerId === member.userId && t.status === 'DONE' && t.completedAt && new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(t.completedAt)) === date).length,
      overdue: queue.filter(t => { const late = daysLate(t, date); return late !== null && late > 0; }).length,
      unaccepted: queue.filter(t => t.assignedAt && !t.acknowledgedAt).length,
    };
  }).sort((a, b) => Number(a.member.onLeave) - Number(b.member.onLeave) || Number(b.configured) - Number(a.configured) || Number(a.unknown) - Number(b.unknown) || a.points - b.points);
}

export type AssignmentCandidate = ReturnType<typeof assignmentCandidates>[number];

export function assignmentWarnings(candidate?: AssignmentCandidate) {
  if (!candidate) return ['ยังตรวจสอบภาระงานล่าสุดไม่ได้'];
  return [
    ...(candidate.member.onLeave ? ['มีวันลาที่อนุมัติในวันที่เลือก'] : []),
    ...(!candidate.configured ? ['ยังไม่ได้ตั้งประเภทงานนี้ให้สมาชิก'] : []),
    ...(candidate.unknownCount ? [`${candidate.unknownCount} งานยังไม่มีรายงานของผู้ทำในวันที่เลือก`] : []),
    ...(!candidate.queue.length && !candidate.reviews.length ? ['ยังไม่มีงานบันทึกในระบบ จึงยังสรุปว่าว่างไม่ได้'] : []),
    ...candidate.queue.filter(t => t.blocker || t.holdReason || t.blockedBy).map(t => `${t.title}: ${t.holdReason || t.blocker || `รอ ${t.blockedBy}`}`),
    ...(candidate.member.appointments.length ? [`มี ${candidate.member.appointments.length} นัดในวันที่เลือก${candidate.member.appointments.some(e => !e.endAt) ? ' และยังไม่ทราบเวลาสิ้นสุดบางนัด' : ''}`] : []),
    ...(queueLoad(candidate.points, candidate.member.standardPoints) === 'over' ? [`คิวงานเกินเกณฑ์ ${candidate.points - candidate.member.standardPoints} แต้ม ตรวจลำดับงานก่อนเพิ่ม`]
      : queueLoad(candidate.points, candidate.member.standardPoints) === 'near' ? ['คิวงานใกล้เกณฑ์ ตรวจลำดับงานก่อนเพิ่ม'] : []),
  ];
}

export function daysLate(task: DailyWorkTask, date: string) {
  if (!task.dueDate || !task.assigneeId || ['DONE', 'PENDING_REVIEW'].includes(task.status)) return null;
  const dueDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(new Date(task.dueDate));
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${dueDay}T00:00:00Z`)) / 86400000);
  return diff >= 0 ? diff : null;
}

/** Shared by the web and mobile work queues, using the office's Bangkok day. */
export function followUpReason(task: DailyWorkTask, date: string): string | null {
  if (task.status === 'DONE') return null;
  const late = daysLate(task, date);
  if (task.holdReason) return `พักไว้: ${task.holdReason}`;
  if (task.blocker) return `ติด: ${task.blocker}`;
  if (task.blockedBy) return `รอ "${task.blockedBy}" เสร็จก่อน`;
  if (late !== null) return late === 0 ? 'ครบกำหนดวันนี้ ยังไม่ส่ง' : `เลยกำหนด ${late} วัน ยังไม่ส่ง`;
  if (task.status === 'PENDING_REVIEW') return 'รอตรวจ';
  if (task.assignedAt && !task.acknowledgedAt) return 'ยังไม่รับทราบงาน';
  if (task.workerId && task.scheduledFor?.slice(0, 10) === date && !updatedOn(task, date)) return 'วางแผนทำวันนี้ ยังไม่อัปเดต';
  return null;
}

/** Decisions before detail: blocked work, missing ownership, deadlines, then follow-up. */
export function ownerDecisionTasks(tasks: DailyWorkTask[], date: string) {
  return tasks.flatMap(task => {
    if (task.status === 'DONE') return [];
    const blocked = !!(task.blocker || task.holdReason || task.blockedBy);
    const reason = followUpReason(task, date) ?? (!task.assigneeId ? 'ยังไม่มีผู้รับผิดชอบ' : null);
    if (!reason) return [];
    const late = daysLate(task, date);
    const rank = blocked ? 100 : !task.assigneeId ? 90 : late !== null && late > 0 ? 80 : late === 0 ? 70 : task.status === 'PENDING_REVIEW' ? 60 : 40;
    return [{ task, reason, rank }];
  }).sort((a, b) => b.rank - a.rank || (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999'));
}

export interface TeamRadarDay {
  outlookBusyMinutes: number;
  date: string; taskCount: number; points: number; eventCount: number; courtCount: number; onLeave: boolean;
}

export interface TeamRadarMember {
  userId: string; firstName: string; lastName: string; role: string;
  openCount: number; openPoints: number; standardPoints: number; overdueCount: number; reviewCount: number; unscheduledCount: number;
  days: TeamRadarDay[];
}

export interface TeamRadar { start: string; days: string[]; members: TeamRadarMember[] }

export interface PersonWorkload {
  outlookBusy: { start: string; end: string }[];
  userId: string; firstName: string; lastName: string; role: string; workTypes: TaskWorkType[];
  tasks: { id: string; title: string; status: string; dueDate: string | null; scheduledFor: string | null; size: TaskSize; overdue: boolean; holdReason: string | null; case: { id: string; ownRef: string; title: string } | null }[];
  /** Work this person handed in, waiting for someone else to review. */
  submitted: { id: string; title: string; dueDate: string | null }[];
  /** The person's review queue ("รอฉันตรวจ"). */
  reviews: { id: string; title: string; dueDate: string | null }[];
  cases: { id: string; ownRef: string; title: string; status: string; role: 'LEAD' | 'BUDDY' }[];
  /** Cases this person works on that the viewer cannot open. */
  hiddenCaseCount: number;
  events: { id: string; title: string; startAt: string; endAt: string | null; courtName: string | null }[];
  /** type is null when the viewer may not see why (only the owner and the person do). */
  leaves: { id: string; type: string | null; startDate: string; endDate: string }[];
}

export interface AssigneeLoad {
  userId: string; firstName: string; lastName: string; firmRole: string;
  openCaseCount: number; overdueTaskCount: number;
  leave: { startDate: string; endDate: string } | null;
}
