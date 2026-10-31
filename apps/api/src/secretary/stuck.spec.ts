import { bangkokDaysBetween, isStuck, lastMovementAt, rankStuck, StuckTaskRow } from './stuck';

const d = (s: string) => new Date(s);

describe('lastMovementAt', () => {
  const base = {
    createdAt: d('2026-10-01T00:00:00Z'), assignedAt: null, acknowledgedAt: null,
    planConfirmedAt: null, submittedAt: null, assignmentLogDates: [], changeAuditDates: [],
  };
  it('falls back to createdAt', () => {
    expect(lastMovementAt(base)).toEqual(base.createdAt);
  });
  it('returns the max of all dates', () => {
    const t = {
      ...base, assignedAt: d('2026-10-02T00:00:00Z'), submittedAt: d('2026-10-05T00:00:00Z'),
      assignmentLogDates: [d('2026-10-03T00:00:00Z')], changeAuditDates: [d('2026-10-04T00:00:00Z')],
    };
    expect(lastMovementAt(t)).toEqual(d('2026-10-05T00:00:00Z'));
  });
});

describe('bangkokDaysBetween', () => {
  it('is 0 within the same Bangkok day', () => {
    expect(bangkokDaysBetween(d('2026-10-30T23:00:00Z'), d('2026-10-31T01:00:00Z'))).toBe(0);
  });
  it('counts calendar days', () => {
    expect(bangkokDaysBetween(d('2026-10-28T03:00:00Z'), d('2026-10-31T03:00:00Z'))).toBe(3);
  });
  it('counts across Bangkok midnight even when under 24h', () => {
    expect(bangkokDaysBetween(d('2026-10-30T16:00:00Z'), d('2026-10-30T18:00:00Z'))).toBe(1);
  });
});

const row = (o: Partial<StuckTaskRow> = {}): StuckTaskRow => ({
  taskId: 't', title: 't', status: 'x', caseId: null, intakeId: null, matterTitle: '',
  assigneeId: null, assigneeName: null, dueDate: null, daysStuck: 0, daysOverdue: 0,
  holdReason: null, holdFollowUpOverdue: false, hearingWithin7Days: false, ...o,
});

describe('isStuck', () => {
  it('overdue', () => expect(isStuck(row({ daysOverdue: 1 }), 3)).toBe(true));
  it('at threshold', () => expect(isStuck(row({ daysStuck: 3 }), 3)).toBe(true));
  it('below threshold', () => expect(isStuck(row({ daysStuck: 2 }), 3)).toBe(false));
  it('hold follow-up overdue', () => expect(isStuck(row({ holdFollowUpOverdue: true }), 3)).toBe(true));
});

describe('rankStuck', () => {
  it('hearing first, then max(daysStuck, daysOverdue) desc', () => {
    const a = row({ taskId: 'a', daysStuck: 5 });
    const b = row({ taskId: 'b', daysOverdue: 9 });
    const c = row({ taskId: 'c', daysStuck: 1, hearingWithin7Days: true });
    expect(rankStuck([a, b, c]).map((r) => r.taskId)).toEqual(['c', 'b', 'a']);
  });
});
