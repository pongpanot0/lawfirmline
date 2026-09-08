/**
 * Display helpers pinned to Asia/Bangkok.
 *
 * The API returns instants and the firm reads them in Thai local time, so the
 * zone is fixed here rather than following the viewer's device — a lawyer
 * travelling abroad must still see the hearing time the court will use.
 */
const BANGKOK = 'Asia/Bangkok';

/** `HH:mm` of an ISO instant, in Bangkok. */
export function bangkokTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/**
 * Label for a `YYYY-MM-DD` Bangkok day key.
 *
 * The key is already a Bangkok calendar day, so it is read as UTC: converting
 * it again would shift it onto the day before.
 */
export function bangkokDayLabel(dayKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dayKey}T00:00:00Z`));
}

/**
 * Thailand has been a fixed UTC+7 since 1920 and observes no daylight saving,
 * so a constant offset converts exactly in both directions. Do not copy this
 * approach for zones that shift.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`, in Bangkok.
 *
 * `toISOString().slice(0, 16)` is the trap this replaces: it renders the UTC
 * wall clock, so a 09:00 hearing shows as 02:00 and a late-evening one lands on
 * the wrong day.
 */
export function bangkokInputValue(date: string | Date): string {
  const instant = typeof date === 'string' ? new Date(date) : date;
  return new Date(instant.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 16);
}

/** `YYYY-MM-DD` for `<input type="date">`, in Bangkok. */
export function bangkokDateInputValue(date: string | Date): string {
  return bangkokInputValue(date).slice(0, 10);
}

/** The instant an `<input type="datetime-local">` value names in Bangkok. */
export function bangkokInputToIso(value: string): string {
  return new Date(`${value.length === 16 ? value : value.slice(0, 16)}:00+07:00`).toISOString();
}

/** The instant 00:00 Bangkok on an `<input type="date">` value. */
export function bangkokDateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00+07:00`).toISOString();
}
