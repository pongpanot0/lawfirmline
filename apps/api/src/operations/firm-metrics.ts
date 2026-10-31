import { bangkokDayEnd } from '../common/utils/bangkok-time';
import { bangkokMonthOf, monthRange } from './owner-kpis';

export const METRICS_PERIODS = ['this_month', 'last_month', 'quarter', 'year'] as const;
export type MetricsPeriod = (typeof METRICS_PERIODS)[number];

const DAY_MS = 86400000;

/**
 * Bangkok calendar range for a period: `from` inclusive, `to` exclusive (the query window).
 * `months` is the multiplier for a monthly target, prorated by days so an in-progress period
 * is not judged against a full target: each month counts days elapsed (through today) / days
 * in that month, so past months are 1 and future months are 0.
 */
export function periodRange(period: MetricsPeriod, now: Date): { from: Date; to: Date; months: number } {
  const current = bangkokMonthOf(now);
  const year = Number(current.slice(0, 4));
  const month = Number(current.slice(5));
  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
  let first: number;
  let count: number;
  if (period === 'this_month') [first, count] = [month, 1];
  else if (period === 'last_month') [first, count] = [month - 1, 1];
  else if (period === 'quarter') [first, count] = [month - ((month - 1) % 3), 3];
  else [first, count] = [1, 12];

  const from = monthRange(monthKey(year, first)).start;
  const to = monthRange(monthKey(year, first + count - 1)).end;
  const elapsedUntil = bangkokDayEnd(now).getTime();
  let months = 0;
  for (let i = 0; i < count; i++) {
    const { start, end } = monthRange(monthKey(year, first + i));
    const length = (end.getTime() - start.getTime()) / DAY_MS;
    const elapsed = Math.min(length, Math.max(0, (elapsedUntil - start.getTime()) / DAY_MS));
    months += elapsed / length;
  }
  return { from, to, months };
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
