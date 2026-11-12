import { EscalationScheduler } from './escalation.scheduler';

const NOW = new Date('2026-11-12T01:30:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const task = (id: string, overdue: number, assigneeId = 'u-assignee') => ({
  id,
  title: `Task ${id}`,
  caseId: 'case-1',
  assigneeId,
  dueDate: daysAgo(overdue),
  requiresReview: false,
  routine: null,
  case: { id: 'case-1', firmId: 'firm-1', title: 'Case', leadLawyerId: 'u-lead', ownRef: 'REF1', blackCaseNumber: null, redCaseNumber: null },
});

describe('EscalationScheduler', () => {
  const prisma = {
    task: { findMany: jest.fn() },
    firmMember: { findMany: jest.fn().mockResolvedValue([{ firmId: 'firm-1', userId: 'u-owner' }]) },
    taskOnHold: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const notifier = { notifyAssigned: jest.fn().mockResolvedValue({}) };
  const automationLog = { record: jest.fn() };
  const scheduler = new EscalationScheduler(prisma as never, notifier as never, automationLog as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  const byUser = () => Object.fromEntries(notifier.notifyAssigned.mock.calls.map(([p]) => [p.userIds[0], p]));

  it('sends each recipient one message per run, listing every task', async () => {
    prisma.task.findMany.mockResolvedValue([task('a', 29), task('b', 27), task('c', 1)]);

    await scheduler.run();

    const sent = byUser();
    expect(notifier.notifyAssigned).toHaveBeenCalledTimes(3); // assignee, lead, owner — once each
    expect(sent['u-assignee'].summaryText).toBe(
      [
        '⚠️ งานที่ต้องตาม 3 งาน',
        '• Task a (Our Ref: REF1) — เลยกำหนด 29 วัน',
        '• Task b (Our Ref: REF1) — เลยกำหนด 27 วัน',
        '• Task c (Our Ref: REF1) — เลยกำหนด 1 วัน',
      ].join('\n'),
    );
    expect(sent['u-assignee'].entityPath).toBe('/todos');
    // Owners only hear about tasks ≥ 3 days late.
    expect(sent['u-owner'].summaryText.split('\n')).toHaveLength(3);
  });

  it('keeps the single-task message with its case link and Done button', async () => {
    prisma.task.findMany.mockResolvedValue([task('a', 1)]);

    await scheduler.run();

    const p = byUser()['u-assignee'];
    expect(p.summaryText).toBe('⚠️ งาน "Task a"\nOur Ref: REF1\nเลยกำหนด 1 วัน');
    expect(p.entityPath).toBe('/cases/case-1');
    expect(p.lineActions('u-assignee')).toBeDefined();
    expect(byUser()['u-owner']).toBeUndefined();
  });
});
