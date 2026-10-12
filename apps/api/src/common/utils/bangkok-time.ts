/**
 * Date helpers pinned to Asia/Bangkok.
 *
 * Everything the firm schedules is read in Thai local time, but the API may run
 * on a server in any timezone. Using `new Date()` boundaries or
 * `toLocaleString()` without an explicit zone makes "today" and "tomorrow"
 * depend on where the process happens to be deployed — which silently breaks a
 * daily digest. These helpers make the zone explicit.
 *
 * Thailand is a fixed UTC+7 and has observed no daylight saving since 1920, so
 * a constant offset is exact here; do not copy this approach for other zones.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The wall-clock fields as they read in Bangkok, carried in a UTC-based Date. */
function toBangkokWallClock(date: Date): Date {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS);
}

/** `YYYY-MM-DD` of the Bangkok calendar day containing `date`. */
export function bangkokDayKey(date: Date): string {
  return toBangkokWallClock(date).toISOString().slice(0, 10);
}

/** The instant of 00:00 Bangkok on the Bangkok day containing `date`. */
export function bangkokDayStart(date: Date): Date {
  const wall = toBangkokWallClock(date).getTime();
  return new Date(wall - (wall % DAY_MS) - BANGKOK_OFFSET_MS);
}

/** The instant just after the Bangkok day containing `date` ends. */
export function bangkokDayEnd(date: Date): Date {
  return new Date(bangkokDayStart(date).getTime() + DAY_MS);
}

/**
 * The Bangkok calendar day as a date-only value (UTC midnight), for columns
 * declared `@db.Date` where a timestamp would shift across the date boundary.
 */
export function bangkokDateOnly(date: Date): Date {
  return new Date(`${bangkokDayKey(date)}T00:00:00.000Z`);
}

/** Same clock time, `days` Bangkok days later (negative moves backwards). */
export function addBangkokDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Whole Bangkok days from `from`'s day to `to`'s day; negative when earlier. */
export function bangkokDayDiff(from: Date, to: Date): number {
  return Math.round(
    (bangkokDayStart(to).getTime() - bangkokDayStart(from).getTime()) / DAY_MS,
  );
}

/** True when the Bangkok calendar day containing `date` is a Sat or Sun. */
export function isBangkokWeekend(date: Date): boolean {
  const weekday = toBangkokWallClock(date).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** `DD/MM/YYYY HH:mm` in Bangkok local time. */
export function formatBangkokDateTime(date: Date): string {
  const wall = toBangkokWallClock(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${pad(wall.getUTCDate())}/${pad(wall.getUTCMonth() + 1)}/${wall.getUTCFullYear()}` +
    ` ${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`
  );
}

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const THAI_WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** e.g. `อ. 8 ก.ย. 2569` — Thai weekday, day, short month, Buddhist year. */
export function formatBangkokDateThai(date: Date): string {
  const wall = toBangkokWallClock(date);
  return (
    `${THAI_WEEKDAYS[wall.getUTCDay()]} ${wall.getUTCDate()} ` +
    `${THAI_MONTHS[wall.getUTCMonth()]} ${wall.getUTCFullYear() + 543}`
  );
}

/** `HH:mm` in Bangkok local time. */
export function formatBangkokTime(date: Date): string {
  const wall = toBangkokWallClock(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/**
 * The Bangkok day on which a period of `months` months from `date` ends.
 *
 * Positive counts follow ป.พ.พ. ม.193/3 + 193/5: counting starts the day AFTER
 * `date`; the period ends on the day before the same day-of-month `months`
 * later, or on the last day of that month when it has no such day. (30 Apr +1
 * month = 31 May; 31 Jan +1 = 28 Feb.) Negative counts are a plain calendar
 * step back: same day of month, clamped to the month's last day.
 * Returns 00:00 Bangkok of that day.
 */
export function addBangkokMonths(date: Date, months: number): Date {
  const [year, month, day] = bangkokDayKey(date).split('-').map(Number);
  const monthLength = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  let target: number;
  if (months > 0) {
    const start = new Date(Date.UTC(year, month - 1, day + 1));
    const [sy, sm, sd] = [start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()];
    const first = new Date(Date.UTC(sy, sm + months, 1));
    const [ty, tm] = [first.getUTCFullYear(), first.getUTCMonth()];
    const last = monthLength(ty, tm);
    // Date.UTC rolls a day-0 (sd - 1) back to the previous month's last day.
    target = sd > last ? Date.UTC(ty, tm, last) : Date.UTC(ty, tm, sd - 1);
  } else {
    const first = new Date(Date.UTC(year, month - 1 + months, 1));
    const [ty, tm] = [first.getUTCFullYear(), first.getUTCMonth()];
    target = Date.UTC(ty, tm, Math.min(day, monthLength(ty, tm)));
  }
  return new Date(target - BANGKOK_OFFSET_MS);
}

/** Rule deadlines fall due when the court counter closes: 16:30 Bangkok on `dayKey` (`YYYY-MM-DD`). */
export function courtCloseAt(dayKey: string): Date {
  return new Date(`${dayKey}T16:30:00+07:00`);
}
