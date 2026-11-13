import type { FirmRole } from './firm-role';

export type TaskRef = { id: string; title: string; caseRef: string | null };
export type StandupState = 'not_required' | 'on_leave' | 'not_yet' | 'checked_in' | 'skipped' | 'blocked';
export interface StandupEntry {
  day: string; status: 'CHECKED_IN' | 'SKIPPED'; yesterday: TaskRef[]; yesterdayNote: string | null;
  today: TaskRef[]; todayNote: string | null; blocker: string | null; updatedAt: string;
}
export interface StandupToday {
  day: string; required: boolean; state: StandupState; entry: StandupEntry | null;
  suggestions: { yesterday: TaskRef[]; today: TaskRef[] };
}

/** A string is a Bangkok calendar day; a Date is an instant, read in UTC+7. */
export function standupRequired({ firmRole, day, onLeave, isHoliday }: {
  firmRole: FirmRole | string; day: string | Date; onLeave: boolean; isHoliday: boolean;
}): boolean {
  if (day instanceof Date && Number.isNaN(day.getTime())) return false;
  const key = day instanceof Date ? new Date(day.getTime() + 7 * 3600000).toISOString().slice(0, 10) : day;
  const date = new Date(`${key}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) return false;
  return ['LAWYER', 'SENIOR_LAWYER'].includes(firmRole) && !onLeave && !isHoliday && ![0, 6].includes(date.getUTCDay());
}
