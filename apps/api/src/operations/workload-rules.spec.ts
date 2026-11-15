import { assignmentWarnings, compareWorkload, sizeFromDays, sizeFromHistory, dayLoad, personalStandard, queueLoad, workloadStatus, type AssignmentCandidate } from '@lawfirm/shared';

// The same thresholds drive web, mobile, MCP and the assign form, so the boundaries are pinned here once.
describe('workload rules', () => {
  it('queue: 10 points is full (near), only above 10 is over', () => {
    expect([7, 8, 10, 11].map((p) => queueLoad(p))).toEqual(['ok', 'near', 'near', 'over']);
  });
  it('day: 4 points is busy, only above 4 is over', () => {
    expect([2, 3, 4, 5].map(dayLoad)).toEqual(['ok', 'busy', 'busy', 'over']);
  });
  it('someone with overdue work is never free', () => {
    const days = [{ onLeave: false }];
    expect(workloadStatus({ standardPoints: 10, openPoints: 1, overdueCount: 1, days })).toBe('has_overdue');
    expect(workloadStatus({ standardPoints: 10, openPoints: 1, overdueCount: 0, days })).toBe('free');
    expect(workloadStatus({ standardPoints: 10, openPoints: 1, overdueCount: 1, days: [{ onLeave: true }] })).toBe('on_leave_this_week');
    expect(workloadStatus({ standardPoints: 10, openPoints: 11, overdueCount: 0, days: [{ onLeave: true }] })).toBe('over_standard');
  });
  it('assign warnings use the same queue words as the team page', () => {
    const at = (points: number) => assignmentWarnings({ points, member: { onLeave: false, appointments: [], standardPoints: 10 }, configured: true, unknownCount: 0, queue: [{}], reviews: [] } as unknown as AssignmentCandidate);
    expect(at(7)).toEqual([]);
    expect(at(10)).toEqual(['คิวงานใกล้เกณฑ์ ตรวจลำดับงานก่อนเพิ่ม']);
    expect(at(12)).toEqual(['คิวงานเกินเกณฑ์ 2 แต้ม ตรวจลำดับงานก่อนเพิ่ม']);
  });
  it('team radar sorts by load vs own standard, overdue breaks ties, leave last', () => {
    const m = (name: string, openPoints: number, overdueCount = 0, onLeave = false) => ({ name, openPoints, standardPoints: 10, overdueCount, days: [{ onLeave }] });
    const sorted = [m('free', 2), m('leave', 1, 0, true), m('near', 8), m('overdue', 3, 2), m('over', 12), m('leaveOverdue', 1, 1, true), m('over2', 15)].sort(compareWorkload);
    expect(sorted.map((x) => x.name)).toEqual(['over2', 'over', 'near', 'overdue', 'free', 'leaveOverdue', 'leave']);
  });
  it('each person has their own standard from the last month of finished work', () => {
    expect(personalStandard({ points: 80, count: 20 })).toBe(20); // fast: 20/week
    expect(personalStandard({ points: 24, count: 10 })).toBe(6); // slower: full at 6
    expect(personalStandard({ points: 6, count: 3 })).toBe(10); // too little history → office default
    expect(personalStandard({ points: 8, count: 8 })).toBe(5); // floor
    expect(personalStandard({ points: 400, count: 100 })).toBe(30); // cap
    expect(queueLoad(12, 20)).toBe('ok');
    expect(queueLoad(8, 6)).toBe('over');
    expect(workloadStatus({ openPoints: 12, standardPoints: 20, overdueCount: 0, days: [{ onLeave: false }] })).toBe('free');
  });
  it('fuller relative to own standard comes first', () => {
    const m = (name: string, openPoints: number, standardPoints: number) => ({ name, openPoints, standardPoints, overdueCount: 0, days: [{ onLeave: false }] });
    expect([m('big', 22, 20), m('small', 8, 6)].sort(compareWorkload).map((x) => x.name)).toEqual(['small', 'big']);
  });
});

describe('team radar order', () => {
  it('keeps the two busiest together even when a lighter member has overdue work', () => {
    const m = (name: string, openPoints: number, overdueCount: number) => ({ name, openPoints, standardPoints: 10, overdueCount, days: [{ onLeave: false }] });
    expect([m('light-late', 2, 1), m('near', 8, 0), m('over', 12, 1)].sort(compareWorkload).map((x) => x.name)).toEqual(['over', 'near', 'light-late']);
  });
});

describe('task size from data', () => {
  it('maps planned days to the size labels', () => {
    expect(sizeFromDays(0.5)).toBe('S'); expect(sizeFromDays(1)).toBe('M'); expect(sizeFromDays(2)).toBe('L');
  });
  it('uses the median of past durations, only with enough history', () => {
    expect(sizeFromHistory([1, 1, 1, 1])).toBeNull();
    expect(sizeFromHistory([0.2, 0.5, 0.8, 9, 0.3])).toBe('S');
    expect(sizeFromHistory([2, 2, 3, 10, 1])).toBe('M');
    expect(sizeFromHistory([4, 5, 6, 1, 7])).toBe('L');
  });
});
