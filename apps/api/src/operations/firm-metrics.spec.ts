import { computeMemberMetrics, groupCollectedRatio, periodRange } from './firm-metrics';

const base = {
  workedHours: 0, workedAmount: 0, invoicedHours: 0, invoicedAmount: 0,
  collectedHours: 0, collectedAmount: 0, targetMonthly: null as number | null, months: 1,
};

describe('computeMemberMetrics', () => {
  it('worked 12 / invoiced 10 (2 written off) -> realization 0.8333', () => {
    expect(computeMemberMetrics({ ...base, workedHours: 12, invoicedHours: 10 }).realization).toBe(0.8333);
  });

  it('utilization = worked / (target x months); null without a target', () => {
    expect(computeMemberMetrics({ ...base, workedHours: 60, targetMonthly: 80, months: 1 }).utilization).toBe(0.75);
    expect(computeMemberMetrics({ ...base, workedHours: 180, targetMonthly: 80, months: 3 }).utilization).toBe(0.75);
    expect(computeMemberMetrics({ ...base, workedHours: 60 }).utilization).toBeNull();
    expect(computeMemberMetrics({ ...base, workedHours: 60, targetMonthly: 0 }).utilization).toBeNull();
  });

  it('null ratios when the denominator is 0', () => {
    const m = computeMemberMetrics(base);
    expect(m).toEqual({ utilization: null, realization: null, collection: null });
  });

  it('collection = collected / invoiced hours', () => {
    expect(computeMemberMetrics({ ...base, workedHours: 10, invoicedHours: 10, collectedHours: 6 }).collection).toBe(0.6);
  });
});

describe('groupCollectedRatio', () => {
  it('is paid / total, capped at 1, 0 when total is 0', () => {
    expect(groupCollectedRatio(60, 100)).toBe(0.6);
    expect(groupCollectedRatio(150, 100)).toBe(1);
    expect(groupCollectedRatio(10, 0)).toBe(0);
  });
});

describe('periodRange (Bangkok)', () => {
  const now = new Date('2026-11-15T05:00:00Z');
  it('quarter = Oct 1 .. Jan 1 (exclusive)', () => {
    expect(periodRange('quarter', now)).toEqual({
      from: new Date('2026-09-30T17:00:00Z'),
      to: new Date('2026-12-31T17:00:00Z'),
      months: 1.5,
    });
  });
  it('this_month / last_month / year', () => {
    expect(periodRange('this_month', now)).toEqual({ from: new Date('2026-10-31T17:00:00Z'), to: new Date('2026-11-30T17:00:00Z'), months: 0.5 });
    expect(periodRange('last_month', now)).toEqual({ from: new Date('2026-09-30T17:00:00Z'), to: new Date('2026-10-31T17:00:00Z'), months: 1 });
    expect(periodRange('year', now)).toEqual({ from: new Date('2025-12-31T17:00:00Z'), to: new Date('2026-12-31T17:00:00Z'), months: 10.5 });
  });
  it('uses the Bangkok month at the UTC boundary', () => {
    // 2026-10-31T20:00Z is already Nov 1 in Bangkok
    expect(periodRange('this_month', new Date('2026-10-31T20:00:00Z')).from).toEqual(new Date('2026-10-31T17:00:00Z'));
  });
  it('prorates months by days elapsed; past periods stay whole', () => {
    expect(periodRange('this_month', now).months).toBe(0.5);
    expect(periodRange('quarter', now).months).toBe(1.5); // Oct 1 + Nov 15/30 + Dec 0
    expect(periodRange('year', now).months).toBe(10.5);
    expect(periodRange('last_month', now).months).toBe(1);
    expect(periodRange('last_month', new Date('2026-11-01T02:00:00Z')).months).toBe(1);
    expect(periodRange('this_month', new Date('2026-11-30T05:00:00Z')).months).toBe(1);
  });
});
