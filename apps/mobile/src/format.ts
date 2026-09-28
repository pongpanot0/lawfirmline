const TH_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

/** "16 ก.ย. 2569" — Buddhist era, Asia/Bangkok wall clock. */
export function thDate(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

/** "อังคาร 16 ก.ย. 2569" */
export function thDateLong(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return `${TH_DAYS[d.getUTCDay()]} ${thDate(iso)}`;
}

/** "09:30" */
export function thTime(iso: string | Date): string {
  const d = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
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

/** Western digits and comma groups for baht amounts on both Hermes and JS. */
export function formatMoney(value: number | string): string {
  const amount = Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(amount)) return '—';
  const [whole, fraction] = amount.toFixed(2).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === '00' ? '' : `.${fraction}`}`;
}

/** Keep the expense form readable while preserving a decimal point in progress. */
export function formatMoneyInput(value: string): string | null {
  const plain = value.replace(/,/g, '').trim();
  if (!/^\d*(?:\.\d{0,2})?$/.test(plain)) return null;
  const [whole, fraction] = (plain.startsWith('.') ? `0${plain}` : plain).split('.');
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Calendar API bounds are inclusive instants, while the UI picks Bangkok dates. */
export function calendarRangeQuery(from: string, to: string): string {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `${from}T00:00:00+07:00` : from;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999+07:00` : to;
  return `from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`;
}
