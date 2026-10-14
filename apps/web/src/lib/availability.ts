/**
 * Pure helpers for the "team availability" strip in the event dialog.
 * All times are minutes since Bangkok midnight of the day being looked at.
 */

export const WORK_START = 8 * 60;
export const WORK_END = 19 * 60;
const STEP = 30;
const DAY = 24 * 60;

export interface MinuteRange {
  start: number;
  end: number;
}

export const DURATION_OPTIONS = [
  { minutes: 30, label: '30 นาที' },
  { minutes: 60, label: '1 ชม.' },
  { minutes: 90, label: '1.5 ชม.' },
  { minutes: 120, label: '2 ชม.' },
  { minutes: 180, label: '3 ชม.' },
  { minutes: 240, label: 'ครึ่งวัน (4 ชม.)' },
];
export const DEFAULT_DURATION = 60;

/** An ISO busy block as minutes of the given Bangkok day (clamped), or null when it misses that day. */
export function toMinuteRange(block: { start: string; end: string }, date: string): MinuteRange | null {
  const dayStart = new Date(`${date}T00:00:00+07:00`).getTime();
  const start = Math.max(0, Math.round((new Date(block.start).getTime() - dayStart) / 60000));
  const end = Math.min(DAY, Math.round((new Date(block.end).getTime() - dayStart) / 60000));
  return end > start ? { start, end } : null;
}

export function overlapsAny(slot: MinuteRange, busy: MinuteRange[]): boolean {
  return busy.some((b) => slot.start < b.end && b.start < slot.end);
}

/** Left/width in percent of the 08:00-19:00 strip; null when fully outside it. */
export function blockPosition(range: MinuteRange): { left: number; width: number } | null {
  const start = Math.max(range.start, WORK_START);
  const end = Math.min(range.end, WORK_END);
  if (end <= start) return null;
  const span = WORK_END - WORK_START;
  return { left: ((start - WORK_START) / span) * 100, width: ((end - start) / span) * 100 };
}

/** Earliest start (>= notBefore, on a 30-minute step) where `duration` fits free for everyone. */
export function findFirstFreeSlot(
  busyByPerson: MinuteRange[][],
  duration: number,
  notBefore = WORK_START,
): number | null {
  const busy = busyByPerson.flat();
  const first = Math.max(WORK_START, Math.ceil(notBefore / STEP) * STEP);
  for (let s = first; s + duration <= WORK_END; s += STEP) {
    if (!overlapsAny({ start: s, end: s + duration }, busy)) return s;
  }
  return null;
}

/** Click position (0..1 across the strip) to a 30-minute-snapped start inside working hours. */
export function snapMinutes(fraction: number): number {
  const raw = WORK_START + fraction * (WORK_END - WORK_START);
  const snapped = Math.floor(raw / STEP) * STEP;
  return Math.min(WORK_END - STEP, Math.max(WORK_START, snapped));
}

export function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The next `count` Monday-Friday days after `date` (YYYY-MM-DD). Holidays are not known here. */
export function nextWorkingDays(date: string, count: number): string[] {
  const days: string[] = [];
  const d = new Date(`${date}T00:00:00Z`);
  while (days.length < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** The duration option nearest an event's real length; the default when it has no end. */
export function closestDuration(startAt: string, endAt?: string | null): number {
  if (!endAt) return DEFAULT_DURATION;
  const len = (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000;
  return DURATION_OPTIONS.reduce((best, o) =>
    Math.abs(o.minutes - len) < Math.abs(best - len) ? o.minutes : best, DEFAULT_DURATION);
}

/** Minutes since midnight of a `YYYY-MM-DDTHH:mm` Bangkok wall-clock value. */
export function inputMinutes(value: string): number {
  return Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
}

