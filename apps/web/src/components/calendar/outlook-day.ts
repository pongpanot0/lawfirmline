import type { OutlookCalendarItemDto } from '@lawfirm/shared';

const DAY_MS = 86_400_000;

export function outlookDay(item: Pick<OutlookCalendarItemDto, 'isAllDay' | 'startAt'>): string {
  return item.isAllDay ? item.startAt.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(item.startAt));
}

/**
 * Every day an item should appear on. All-day events are UTC midnights with an exclusive end
 * (Mon–Fri = Mon 00:00Z → Sat 00:00Z), so they span each UTC date; timed events stay on their Bangkok start day.
 */
export function outlookDays(item: Pick<OutlookCalendarItemDto, 'isAllDay' | 'startAt' | 'endAt'>): string[] {
  if (!item.isAllDay) return [outlookDay(item)];
  const start = Date.parse(`${item.startAt.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(item.endAt);
  const days: string[] = [];
  // ponytail: capped at 62 days (the overlay's max fetch range); longer all-day spans are cut.
  for (let t = start; (t < end || days.length === 0) && days.length < 62; t += DAY_MS) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}
