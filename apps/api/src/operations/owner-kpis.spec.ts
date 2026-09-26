import { collectionRate, monthRange, stuckByStage } from './owner-kpis';

describe('collectionRate', () => {
  it('is null when nothing was billed', () => {
    expect(collectionRate(0, 0)).toBeNull();
  });

  it('rounds to 3dp', () => {
    expect(collectionRate(1000, 930)).toBe(0.93);
  });
});

describe('stuckByStage', () => {
  const now = new Date('2026-09-26T00:00:00Z');

  it('counts only cases older than the threshold, grouped by stage, with the oldest day count', () => {
    const cases = [
      { stage: 'FILING', stageChangedAt: new Date('2026-08-20T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') }, // 37d, stuck
      { stage: 'FILING', stageChangedAt: new Date('2026-07-01T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') }, // 87d, stuck
      { stage: 'FILING', stageChangedAt: new Date('2026-09-10T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') }, // 16d, not stuck
      { stage: 'MEDIATION', stageChangedAt: null, createdAt: new Date('2026-07-01T00:00:00Z') }, // no stage change → createdAt, 87d, stuck
    ];

    const result = stuckByStage(cases, 30, now);

    expect(result).toEqual([
      { stage: 'FILING', count: 2, oldestDays: 87 },
      { stage: 'MEDIATION', count: 1, oldestDays: 87 },
    ]);
  });

  it('returns nothing when no case is past the threshold', () => {
    const cases = [{ stage: 'FILING', stageChangedAt: new Date('2026-09-20T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z') }];
    expect(stuckByStage(cases, 30, now)).toEqual([]);
  });
});

describe('monthRange', () => {
  it('gives Bangkok (UTC+7) month boundaries', () => {
    const { start, end, prevStart } = monthRange('2026-09');
    expect(start.toISOString()).toBe('2026-08-31T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(prevStart.toISOString()).toBe('2026-07-31T17:00:00.000Z');
  });
});
