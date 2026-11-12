import type { OutlookCalendarItemDto } from '@lawfirm/shared';

export function outlookDay(item: Pick<OutlookCalendarItemDto, 'isAllDay' | 'startAt'>): string {
  return item.isAllDay ? item.startAt.slice(0, 10) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(item.startAt));
}
