import { bangkokMonthOf, monthRange } from './owner-kpis';

export const METRICS_PERIODS = ['this_month', 'last_month', 'quarter', 'year'] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];

/**
 * Bangkok calendar range for a period: `from` inclusive, `to` exclusive.
 * Every period is whole calendar months, so `months` (the multiplier for a
 * monthly target) is exact; a to-date period would need a day-weighted count.
 */
export function periodRange(period: MetricsPeriod, now: Date): { from: Date; to: Date; months: number } {
  const current = bangkokMonthOf(now);
  const year = Number(current.slice(0, 4));
  const month = Number(current.slice(5));
  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  if (period === 'this_month') {
    const r = monthRange(current);
    return { from: r.start, to: r.end, months: 1 };
  }
  if (period === 'last_month') {
    const r = monthRange(current);
    return { from: r.prevStart, to: r.start, months: 1 };
  }
  const firstMonth = period === 'year' ? 1 : month - ((month - 1) % 3);
  const months = period === 'year' ? 12 : 3;
  return {
    from: monthRange(monthKey(year, firstMonth)).start,
    to: monthRange(monthKey(year, firstMonth + months - 1)).end,
    months,
  };
}

/** Paid share of an invoice group; 0 when nothing was billed, capped at 1 (overpayment). */
export function groupCollectedRatio(groupPaid: number, groupTotal: number): number {
  if (groupTotal <= 0) return 0;
  return Math.min(1, groupPaid / groupTotal);
}

const ratio = (num: number, den: number): number | null =>
  den > 0 ? Math.round((num / den) * 10000) / 10000 : null;

/** Ratios are hour-based (Clio definitions); the amounts ride along for display only. */
export function computeMemberMetrics(input: {
  workedHours: number;
  workedAmount: number;
  invoicedHours: number;
  invoicedAmount: number;
  collectedHours: number;
  collectedAmount: number;
  targetMonthly: number | null;
  months: number;
}): { utilization: number | null; realization: number | null; collection: number | null } {
  return {
    utilization: input.targetMonthly ? ratio(input.workedHours, input.targetMonthly * input.months) : null,
    realization: ratio(input.invoicedHours, input.workedHours),
    collection: ratio(input.collectedHours, input.invoicedHours),
  };
}
