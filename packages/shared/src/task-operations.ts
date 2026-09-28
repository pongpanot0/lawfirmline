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

/** ponytail: fixed office-wide thresholds; per-member capacity when people clearly differ. */
export const HEAVY_QUEUE_POINTS = 10;
export const HEAVY_DAY_POINTS = 4;

export type DailyTaskUpdateInput = { completed: string; remaining: string; blocker?: string };

export function dailyTaskUpdateText(input: DailyTaskUpdateInput) {
  return `ทำถึงไหน: ${input.completed.trim()}\nเหลืออะไร: ${input.remaining.trim()}\nติดอะไร: ${input.blocker?.trim() || 'ไม่มี'}`;
}

export interface DailyWorkTask {
  id: string; title: string; status: string; priority: string;
  assigneeId: string | null; workerId: string | null; reviewerId: string | null;
  caseId: string | null; case: { id: string; ownRef: string; title: string } | null;
  workType: TaskWorkType | null; size: TaskSize; dueDate: string | null; scheduledFor: string | null;
  queuePosition: number; requiresReview: boolean; assignedAt: string | null; acknowledgedAt: string | null;
  completedAt: string | null; holdReason: string | null; blockedBy: string | null;
  blocker: string | null; planConfirmedAt: string | null;
  latestUpdate: { body: string; createdAt: string; authorName: string; authorId: string } | null;
}

export interface DailyWorkMember {
  userId: string; firstName: string; lastName: string; email: string; role: string;
  workTypes: TaskWorkType[]; onLeave: boolean;
  appointments: { id: string; title: string; startAt: string; endAt: string | null }[];
}

export interface DailyWorkboard {
  date: string; fetchedAt: string; members: DailyWorkMember[]; tasks: DailyWorkTask[];
  cases: { id: string; ownRef: string; title: string }[];
}

export interface TeamRadarDay {
  date: string; taskCount: number; points: number; eventCount: number; onLeave: boolean;
}

export interface TeamRadarMember {
  userId: string; firstName: string; lastName: string; role: string;
  openCount: number; openPoints: number; overdueCount: number; reviewCount: number; unscheduledCount: number;
  days: TeamRadarDay[];
}

export interface TeamRadar { start: string; days: string[]; members: TeamRadarMember[] }

export interface PersonWorkload {
  userId: string; firstName: string; lastName: string; role: string;
  tasks: { id: string; title: string; status: string; dueDate: string | null; scheduledFor: string | null; size: TaskSize; overdue: boolean; holdReason: string | null; case: { id: string; ownRef: string; title: string } | null }[];
  reviews: { id: string; title: string; dueDate: string | null }[];
  cases: { id: string; ownRef: string; title: string; status: string; role: 'LEAD' | 'BUDDY' }[];
  events: { id: string; title: string; startAt: string; endAt: string | null; courtName: string | null }[];
  leaves: { id: string; type: string; startDate: string; endDate: string }[];
}
