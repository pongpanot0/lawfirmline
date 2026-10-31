export interface TaskMovementInput {
  createdAt: Date; assignedAt: Date | null; acknowledgedAt: Date | null;
  planConfirmedAt: Date | null; submittedAt: Date | null;
  assignmentLogDates: Date[]; changeAuditDates: Date[];
}

/** Latest sign of life on a task; createdAt when nothing else happened. */
export function lastMovementAt(t: TaskMovementInput): Date {
  const all = [
    t.createdAt, t.assignedAt, t.acknowledgedAt, t.planConfirmedAt, t.submittedAt,
    ...t.assignmentLogDates, ...t.changeAuditDates,
  ].filter((x): x is Date => x != null);
  return new Date(Math.max(...all.map((x) => x.getTime())));
}

const BANGKOK_OFFSET_MS = 7 * 3600_000; // UTC+7, no DST
const DAY_MS = 86_400_000;

/** Whole calendar days between two instants, by Asia/Bangkok date. */
export function bangkokDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) => Math.floor((d.getTime() + BANGKOK_OFFSET_MS) / DAY_MS);
  return day(to) - day(from);
}

export interface StuckTaskRow {
  taskId: string; title: string; status: string;
  caseId: string | null; intakeId: string | null; matterTitle: string;
  assigneeId: string | null; assigneeName: string | null;
  dueDate: Date | null; daysStuck: number; daysOverdue: number;
  holdReason: string | null; holdFollowUpOverdue: boolean; hearingWithin7Days: boolean;
}

export function isStuck(r: StuckTaskRow, stuckTaskDays: number): boolean {
  return r.daysOverdue >= 1 || r.daysStuck >= stuckTaskDays || r.holdFollowUpOverdue;
}

/** Hearing-imminent first, then worst of stuck/overdue days descending. */
export function rankStuck(rows: StuckTaskRow[]): StuckTaskRow[] {
  const worst = (r: StuckTaskRow) => Math.max(r.daysStuck, r.daysOverdue);
  return [...rows].sort(
    (a, b) => Number(b.hearingWithin7Days) - Number(a.hearingWithin7Days) || worst(b) - worst(a),
  );
}
