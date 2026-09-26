import type { LeaveItem } from '../api/types';

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
  if (kind === 'PENDING') return `⚠ ${name} ขอลาวันที่ ${thaiBEDate(date)} (รออนุมัติ)`;
  return `⚠ ${name} ลาวันที่ ${thaiBEDate(date)}`;
}
