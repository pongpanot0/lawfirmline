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

export type DailyTaskUpdateInput = { completed: string; remaining: string; blocker?: string };

export function dailyTaskUpdateText(input: DailyTaskUpdateInput) {
  return `ทำถึงไหน: ${input.completed.trim()}\nเหลืออะไร: ${input.remaining.trim()}\nติดอะไร: ${input.blocker?.trim() || 'ไม่มี'}`;
}

export interface DailyWorkTask {
  id: string; title: string; status: string; priority: string;
  assigneeId: string | null; workerId: string | null; reviewerId: string | null;
  caseId: string | null; case: { id: string; ownRef: string; title: string } | null;
  workType: TaskWorkType | null; dueDate: string | null; scheduledFor: string | null;
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
