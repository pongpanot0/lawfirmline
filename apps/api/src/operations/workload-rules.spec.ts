import { assignmentWarnings, dayLoad, queueLoad, workloadStatus, type AssignmentCandidate } from '@lawfirm/shared';

// The same thresholds drive web, mobile, MCP and the assign form, so the boundaries are pinned here once.
describe('workload rules', () => {
  it('queue: 10 points is full (near), only above 10 is over', () => {
    expect([7, 8, 10, 11].map(queueLoad)).toEqual(['ok', 'near', 'near', 'over']);
  });
  it('day: 4 points is busy, only above 4 is over', () => {
    expect([2, 3, 4, 5].map(dayLoad)).toEqual(['ok', 'busy', 'busy', 'over']);
  });
  it('someone with overdue work is never free', () => {
    const days = [{ onLeave: false }];
    expect(workloadStatus({ openPoints: 1, overdueCount: 1, days })).toBe('has_overdue');
    expect(workloadStatus({ openPoints: 1, overdueCount: 0, days })).toBe('free');
    expect(workloadStatus({ openPoints: 1, overdueCount: 1, days: [{ onLeave: true }] })).toBe('on_leave_this_week');
    expect(workloadStatus({ openPoints: 11, overdueCount: 0, days: [{ onLeave: true }] })).toBe('over_standard');
  });
  it('assign warnings use the same queue words as the team page', () => {
    const at = (points: number) => assignmentWarnings({ points, member: { onLeave: false, appointments: [] }, configured: true, unknownCount: 0, queue: [{}], reviews: [] } as unknown as AssignmentCandidate);
    expect(at(7)).toEqual([]);
    expect(at(10)).toEqual(['คิวงานใกล้เกณฑ์ ตรวจลำดับงานก่อนเพิ่ม']);
    expect(at(12)).toEqual(['คิวงานเกินเกณฑ์ 2 แต้ม ตรวจลำดับงานก่อนเพิ่ม']);
  });
});
