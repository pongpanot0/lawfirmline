import { bangkokDayStart } from '../common/utils/bangkok-time';

export const OUTLOOK_BUSY_STATUSES = ['busy', 'oof', 'tentative', 'workingElsewhere'];

/** Union busy intervals after clipping each day to 07:00–21:00 Bangkok (no DST). */
export function mergeOutlookBusy(
  items: { startAt: Date; endAt: Date; showAs: string; isAllDay: boolean }[],
  from: Date,
  to: Date,
): { start: string; end: string }[] {
  const clipped: { start: number; end: number }[] = [];
  for (let day = bangkokDayStart(from).getTime(); day < to.getTime(); day += 86400000) {
    const start = Math.max(day + 7 * 3600000, from.getTime());
    const end = Math.min(day + 21 * 3600000, to.getTime());
    for (const item of items) {
      if (item.isAllDay || !OUTLOOK_BUSY_STATUSES.includes(item.showAs)) continue;
      const a = Math.max(start, item.startAt.getTime()), b = Math.min(end, item.endAt.getTime());
      if (a < b) clipped.push({ start: a, end: b });
    }
  }
  clipped.sort((a, b) => a.start - b.start);
  const merged: typeof clipped = [];
  for (const block of clipped) {
    const last = merged[merged.length - 1];
    if (last && block.start <= last.end) last.end = Math.max(last.end, block.end);
    else merged.push({ ...block });
  }
  return merged.map((b) => ({ start: new Date(b.start).toISOString(), end: new Date(b.end).toISOString() }));
}
