const TH_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

/** "16 ก.ย. 2569" — Buddhist era, Asia/Bangkok wall clock. */
export function thDate(iso: string | Date): string {
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** "อังคาร 16 ก.ย. 2569" */
export function thDateLong(iso: string | Date): string {
  const d = new Date(iso);
  return `${TH_DAYS[d.getDay()]} ${thDate(d)}`;
}

/** "09:30" */
export function thTime(iso: string | Date): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` of a local date, for agenda range queries. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * `YYYY-MM-DD` of an ISO timestamp as seen on an Asia/Bangkok (UTC+7) wall
 * clock — a task due at 01:00 UTC is already the next day in Bangkok.
 */
export function bangkokDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0] ?? '').join('');
}
