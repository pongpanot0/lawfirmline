import type { CalendarEventItem, LeaveItem } from './api';

export type LeaveFlag = { userId: string; kind: 'ON_LEAVE' | 'PENDING'; label: string };

const TYPE_TH: Record<LeaveItem['type'], string> = {
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
      flags.set(leave.userId, { userId: leave.userId, kind: 'ON_LEAVE', label: `ลา · ${TYPE_TH[leave.type]}` });
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
          title: `${TYPE_TH[leave.type]} · ${leave.user.firstName} ${leave.user.lastName}`,
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
