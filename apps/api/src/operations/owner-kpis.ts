const DAY_MS = 86400000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ratio collected/billed, 3dp; null when nothing was billed (no rate to speak of). */
export function collectionRate(billed: number, collected: number): number | null {
  if (billed === 0) return null;
  return Math.round((collected / billed) * 1000) / 1000;
}

/**
 * Groups open cases stuck past `thresholdDays` in their current stage,
 * counting from stageChangedAt (falling back to createdAt for cases that
 * never logged a stage change).
 */
export function stuckByStage(
  cases: { stage: string; stageChangedAt: Date | null; createdAt: Date }[],
  thresholdDays: number,
  now: Date,
): { stage: string; count: number; oldestDays: number }[] {
  const byStage = new Map<string, number[]>();
  for (const c of cases) {
    const since = c.stageChangedAt ?? c.createdAt;
    const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
    if (days <= thresholdDays) continue;
    const days_ = byStage.get(c.stage) ?? [];
    days_.push(days);
    byStage.set(c.stage, days_);
  }
  return [...byStage.entries()]
    .map(([stage, days]) => ({ stage, count: days.length, oldestDays: Math.max(...days) }))
    .sort((a, b) => b.count - a.count);
}

/** Bangkok (UTC+7) calendar-month boundaries for a 'YYYY-MM' string. */
export function monthRange(month: string): { start: Date; end: Date; prevStart: Date } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1) - BANGKOK_OFFSET_MS);
  const end = new Date(Date.UTC(year, m, 1) - BANGKOK_OFFSET_MS);
  const prevStart = new Date(Date.UTC(year, m - 2, 1) - BANGKOK_OFFSET_MS);
  return { start, end, prevStart };
}

/** Current Bangkok month as 'YYYY-MM', for the route's default. */
export function bangkokMonthOf(now: Date): string {
  const shifted = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}
