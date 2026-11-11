import type { FirmMetricsPeriod } from '@/lib/api';

export function periodMonths(period: FirmMetricsPeriod, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value) - 1;
  const start = period === 'year' ? 0 : period === 'quarter' ? month - month % 3 : period === 'last_month' ? month - 1 : month;
  const end = period === 'last_month' ? month - 1 : month;
  return Array.from({ length: end - start + 1 }, (_, i) => {
    const date = new Date(Date.UTC(year, start + i, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}
