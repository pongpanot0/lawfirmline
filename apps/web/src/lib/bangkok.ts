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
