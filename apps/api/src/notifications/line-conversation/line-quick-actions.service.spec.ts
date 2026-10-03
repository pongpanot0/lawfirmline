import { LineQuickActionsService } from './line-quick-actions.service';

const ID = '11111111-2222-3333-4444-555555555555';

describe('LineQuickActionsService', () => {
  const leaves = { decide: jest.fn() } as any;
  const tasks = { acknowledge: jest.fn(), assertAccess: jest.fn(), update: jest.fn() } as any;
  const billing = { updateExpenseClaimStatus: jest.fn() } as any;
  const events = { acknowledge: jest.fn() } as any;
  const user = { id: 'u1', firmId: 'f1' } as any;
  let svc: LineQuickActionsService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new LineQuickActionsService(leaves, tasks, billing, events);
  });

  it('ignores anything that is not an action payload', async () => {
    await expect(svc.handle(user, 'สวัสดี')).resolves.toBeNull();
    await expect(svc.handle(user, 'task:done:not-a-uuid')).resolves.toBeNull();
  });

  it('leave buttons decide as the tapper', async () => {
    await expect(svc.handle(user, `leave:approve:${ID}`)).resolves.toContain('อนุมัติ');
    expect(leaves.decide).toHaveBeenCalledWith(user, ID, 'APPROVED');
  });

  it('acknowledges a task', async () => {
    tasks.acknowledge.mockResolvedValue({ title: 'ร่างคำฟ้อง' });
    await expect(svc.handle(user, `task:ack:${ID}`)).resolves.toContain('ร่างคำฟ้อง');
    expect(tasks.acknowledge).toHaveBeenCalledWith(ID, user);
  });

  it('closes the tapper\'s own task through the normal update path', async () => {
    tasks.assertAccess.mockResolvedValue({ id: ID, title: 'งาน', assigneeId: 'u1', status: 'TODO', caseId: 'c1' });
    await expect(svc.handle(user, `task:done:${ID}`)).resolves.toContain('ปิดงาน');
    expect(tasks.update).toHaveBeenCalledWith(ID, { status: 'DONE' }, user, 'c1');
  });

  it('will not close someone else\'s task from LINE', async () => {
    tasks.assertAccess.mockResolvedValue({ id: ID, title: 'งาน', assigneeId: 'other', status: 'TODO', caseId: null });
    await expect(svc.handle(user, `task:done:${ID}`)).resolves.toContain('ไม่สำเร็จ');
    expect(tasks.update).not.toHaveBeenCalled();
  });

  it('claim buttons go through the owner-only status change', async () => {
    await svc.handle(user, `claim:reject:${ID}`);
    expect(billing.updateExpenseClaimStatus).toHaveBeenCalledWith(user, ID, { status: 'REJECTED' });
  });

  it('a service refusal comes back as the reply, never a throw', async () => {
    billing.updateExpenseClaimStatus.mockRejectedValue(new Error('Only owner can update claim status'));
    await expect(svc.handle(user, `claim:approve:${ID}`)).resolves.toBe('ทำรายการไม่สำเร็จ: Only owner can update claim status');
  });

  it('event acknowledgement carries the revision it was sent for', async () => {
    await svc.handle(user, `event:ack:${ID}:2026-10-03T05:00:00.000Z`);
    expect(events.acknowledge).toHaveBeenCalledWith(user, ID, '2026-10-03T05:00:00.000Z');
  });
});
