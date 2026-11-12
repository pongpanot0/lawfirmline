import type { CalendarEventItem, LeaveItem } from './api';

export type LeaveFlag = { userId: string; kind: 'ON_LEAVE' | 'PENDING'; label: string };

export const LEAVE_TYPE_TH: Record<LeaveItem['type'], string> = {
  SICK: 'ลาป่วย',
  PERSONAL: 'ลากิจ',
  VACATION: 'ลาพักร้อน',
};

/**
 * Who is on (or asking for) leave on `date`, keyed by userId.
 *
 * APPROVED beats PENDING for the same person; REJECTED is never shown — the
 * flag is a warning for assignee pickers, not a record of leave history.
 */
export function leaveFlagsForDate(
  leaves: Pick<LeaveItem, 'userId' | 'status' | 'type' | 'startDate' | 'endDate'>[],
  date: string,
): Map<string, LeaveFlag> {
  const flags = new Map<string, LeaveFlag>();
  for (const leave of leaves) {
    if (leave.status === 'REJECTED') continue;
    const covers = leave.startDate.slice(0, 10) <= date && date <= leave.endDate.slice(0, 10);
    if (!covers) continue;
    if (leave.status === 'APPROVED') {
      flags.set(leave.userId, { userId: leave.userId, kind: 'ON_LEAVE', label: `ลา · ${LEAVE_TYPE_TH[leave.type]}` });
    } else if (leave.status === 'PENDING' && flags.get(leave.userId)?.kind !== 'ON_LEAVE') {
      flags.set(leave.userId, { userId: leave.userId, kind: 'PENDING', label: 'ขอลา (รออนุมัติ)' });
    }
  }
  return flags;
}

/** `d/M/yyyy` in the Buddhist Era, for a `YYYY-MM-DD` date string. */
function thaiBEDate(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${d}/${m}/${y + 543}`;
}

export function leaveWarning(name: string, date: string, kind?: LeaveFlag['kind']): string {
  if (kind === 'PENDING') return `${name} ขอลาวันที่ ${thaiBEDate(date)} (รออนุมัติ)`;
  return `${name} ลาวันที่ ${thaiBEDate(date)}`;
}

/** Pending leave an approver may decide: never their own, unless they are the owner (mirrors GET /leaves/pending). */
export function leaveApprovalQueue<T extends Pick<LeaveItem, 'userId' | 'status'>>(leaves: T[], user: { id: string; firmRole?: string }): T[] {
  return leaves.filter((leave) => leave.status === 'PENDING' && (user.firmRole === 'OWNER' || leave.userId !== user.id));
}

/**
 * One all-day calendar entry per day of each leave, for month grids.
 * APPROVED always; PENDING only with `includePending` (flagged `leavePending`); REJECTED never.
 */
export function leaveDayEvents(
  leaves: Pick<LeaveItem, 'id' | 'userId' | 'status' | 'type' | 'startDate' | 'endDate' | 'user'>[],
  { includePending = false } = {},
): CalendarEventItem[] {
  return leaves
    .filter((leave) => leave.status === 'APPROVED' || (includePending && leave.status === 'PENDING'))
    .flatMap((leave) => {
      const days: CalendarEventItem[] = [];
      const cursor = new Date(`${leave.startDate.slice(0, 10)}T00:00:00Z`);
      const end = leave.endDate.slice(0, 10);
      while (cursor.toISOString().slice(0, 10) <= end) {
        const date = cursor.toISOString().slice(0, 10);
        days.push({
          id: `leave:${leave.id}:${date}`,
          title: `${LEAVE_TYPE_TH[leave.type]} · ${leave.user.firstName} ${leave.user.lastName}`,
          type: 'LEAVE',
          startAt: `${date}T09:00:00+07:00`,
          endAt: `${date}T18:00:00+07:00`,
          assigneeId: leave.userId,
          leaveId: leave.id,
          leaveType: leave.type,
          leaveOwnerId: leave.userId,
          leaveStartDate: leave.startDate.slice(0, 10),
          leaveEndDate: end,
          ...(leave.status === 'PENDING' && { leavePending: true }),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return days;
    });
}

/** Who decided a leave, for list rows: "อนุมัติโดย …" / "ปฏิเสธโดย …"; sick or owner leave approves itself with no decider. */
export function leaveDecisionText(leave: Pick<LeaveItem, 'status' | 'decidedAt' | 'decidedBy'>): string | null {
  if (leave.status === 'PENDING') return null;
  if (leave.decidedBy) return `${leave.status === 'REJECTED' ? 'ปฏิเสธ' : 'อนุมัติ'}โดย ${leave.decidedBy.firstName} ${leave.decidedBy.lastName}`;
  return leave.status === 'APPROVED' && !leave.decidedAt ? 'อนุมัติอัตโนมัติ' : null;
}

export type LeaveSummaryRow = { userId: string; name: string; SICK: number; PERSONAL: number; VACATION: number; total: number; pending: number };

/** Number of calendar days of `leave` inside `year` (0 when it falls outside). */
export function leaveDaysInYear(leave: Pick<LeaveItem, 'startDate' | 'endDate'>, year: number): number {
  const start = leave.startDate.slice(0, 10) > `${year}-01-01` ? leave.startDate.slice(0, 10) : `${year}-01-01`;
  const end = leave.endDate.slice(0, 10) < `${year}-12-31` ? leave.endDate.slice(0, 10) : `${year}-12-31`;
  return start > end ? 0 : (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
}

/**
 * Per-person leave for one calendar year: approved calendar days by type (a leave
 * crossing New Year counts only its days inside `year`) and the number of pending
 * requests. `people` adds a zero row for anyone without leave. Sorted by name.
 */
export function leaveSummaryByPerson(
  leaves: Pick<LeaveItem, 'userId' | 'status' | 'type' | 'startDate' | 'endDate' | 'user'>[],
  year: number,
  people: { id: string; firstName: string; lastName: string }[] = [],
): LeaveSummaryRow[] {
  const rows = new Map<string, LeaveSummaryRow>();
  const row = (userId: string, name: string) => {
    if (!rows.has(userId)) rows.set(userId, { userId, name, SICK: 0, PERSONAL: 0, VACATION: 0, total: 0, pending: 0 });
    return rows.get(userId)!;
  };
  for (const person of people) row(person.id, `${person.firstName} ${person.lastName}`);
  for (const leave of leaves) {
    const days = leaveDaysInYear(leave, year);
    if (!days || leave.status === 'REJECTED') continue;
    const summary = row(leave.userId, `${leave.user.firstName} ${leave.user.lastName}`);
    if (leave.status === 'PENDING') summary.pending += 1;
    else { summary[leave.type] += days; summary.total += days; }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'th'));
}
