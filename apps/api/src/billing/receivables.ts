export type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';

const DAY_MS = 86400000;

const utcMidnight = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/** Whole days past due; not-yet-due or missing due date → 0. */
export function daysOverdue(dueAt: Date | null, today: Date): number {
  if (!dueAt) return 0;
  return Math.max(0, Math.floor((utcMidnight(today) - utcMidnight(dueAt)) / DAY_MS));
}

export function agingBucket(days: number): AgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

export function summarizeBuckets(rows: { outstanding: number; bucket: AgingBucket }[]): Record<AgingBucket, number> {
  const totals: Record<AgingBucket, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  for (const row of rows) totals[row.bucket] += row.outstanding;
  return totals;
}
