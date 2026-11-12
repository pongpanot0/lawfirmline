import { mergeOutlookBusy } from './outlook-busy';
const row = (start: string, end: string, showAs = 'busy', isAllDay = false) => ({ startAt: new Date(start), endAt: new Date(end), showAs, isAllDay });
const from = new Date('2026-11-11T17:00:00Z'), to = new Date('2026-11-13T17:00:00Z');
describe('mergeOutlookBusy', () => {
  it('unions overlaps/adjacency, clips each Bangkok day at 07–21 and excludes free/all-day', () => {
    expect(mergeOutlookBusy([
      row('2026-11-11T22:00:00Z', '2026-11-12T02:00:00Z'),
      row('2026-11-12T01:00:00Z', '2026-11-12T03:00:00Z', 'tentative'),
      row('2026-11-12T03:00:00Z', '2026-11-12T04:00:00Z', 'oof'),
      row('2026-11-12T13:00:00Z', '2026-11-13T02:00:00Z', 'workingElsewhere'),
      row('2026-11-12T05:00:00Z', '2026-11-12T06:00:00Z', 'free'),
      row('2026-11-12T05:00:00Z', '2026-11-12T06:00:00Z', 'busy', true),
      row('2026-11-12T05:00:00Z', '2026-11-12T06:00:00Z', 'unknown'),
      row('2026-11-12T08:00:00Z', '2026-11-12T07:00:00Z'),
    ], from, to)).toEqual([
      { start: '2026-11-12T00:00:00.000Z', end: '2026-11-12T04:00:00.000Z' },
      { start: '2026-11-12T13:00:00.000Z', end: '2026-11-12T14:00:00.000Z' },
      { start: '2026-11-13T00:00:00.000Z', end: '2026-11-13T02:00:00.000Z' },
    ]);
  });
  it('clips the requested window too and does not mutate its input', () => {
    const rows = [row('2026-11-12T02:00:00Z', '2026-11-12T06:00:00Z')];
    expect(mergeOutlookBusy(rows, new Date('2026-11-12T03:00:00Z'), new Date('2026-11-12T04:00:00Z'))).toEqual([{ start: '2026-11-12T03:00:00.000Z', end: '2026-11-12T04:00:00.000Z' }]);
    expect(rows[0].startAt.toISOString()).toBe('2026-11-12T02:00:00.000Z');
  });
});
