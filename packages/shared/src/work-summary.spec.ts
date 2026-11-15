import { buildWorkSummary, workStage, type WorkSummaryTask } from './work-summary';

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const task = (over: Partial<WorkSummaryTask>): WorkSummaryTask => ({
  id: 'x', title: 't', status: 'TODO', caseRef: null, createdAt: d('2026-11-01'), assignedAt: null, acknowledgedAt: null,
  submittedAt: null, dueDate: null, completedAt: null, onHold: false, blocked: false, ...over,
});

describe('workStage', () => {
  it('review states win over hold and block', () => expect(workStage(task({ status: 'PENDING_REVIEW', onHold: true }))).toBe('pending_review'));
  it('unacknowledged when assigned but not accepted', () => expect(workStage(task({ assignedAt: d('2026-11-01') }))).toBe('unacknowledged'));
  it('in progress', () => expect(workStage(task({ status: 'IN_PROGRESS' }))).toBe('in_progress'));
});

describe('buildWorkSummary', () => {
  const weeks = [d('2026-11-02'), d('2026-11-09')];
  const now = d('2026-11-15');
  const tasks = [
    task({ id: 'a', status: 'DONE', createdAt: d('2026-11-01'), completedAt: d('2026-11-10') }),
    task({ id: 'b', createdAt: d('2026-11-03'), dueDate: d('2026-11-05') }),
    task({ id: 'c', status: 'IN_PROGRESS', createdAt: d('2026-11-12') }),
    task({ id: 'legacy', status: 'DONE', createdAt: d('2026-11-03') }),
  ];
  const s = buildWorkSummary(tasks, weeks, now);
  it('counts closed, added, open and overdue per week', () => {
    expect(s.weeks[0]).toMatchObject({ closed: 0, added: 1, open: 2, overdue: 1 });
    expect(s.weeks[1]).toMatchObject({ closed: 1, added: 1, open: 2, overdue: 1 });
  });
  it('groups open work by stage with age', () => {
    expect(s.stages.find((x) => x.stage === 'not_started')).toMatchObject({ count: 1, oldestDays: 12 });
    expect(s.stages.find((x) => x.stage === 'in_progress')).toMatchObject({ count: 1, avgDays: 3 });
    expect(s.stuck.map((x) => x.id)).toEqual(['b', 'c']);
  });
});
