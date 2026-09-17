import { AssignmentNotifierService } from './assignment-notifier.service';

const prisma = {
  user: { findMany: jest.fn() },
  firmMember: { findMany: jest.fn() },
} as any;
const line = { pushTo: jest.fn().mockResolvedValue(true) } as any;
const config = { get: jest.fn().mockReturnValue('https://app.example.com') } as any;

describe('AssignmentNotifierService', () => {
  let svc: AssignmentNotifierService;
  beforeEach(() => {
    jest.clearAllMocks();
    line.pushTo.mockResolvedValue(true);
    svc = new AssignmentNotifierService(prisma, line, config);
  });

  it('DMs linked users, skipping the actor and unlinked users', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', lineUserId: 'L2' },
      { id: 'u3', lineUserId: null },
    ]);
    await svc.notifyAssigned({
      userIds: ['u1', 'u2', 'u3'],
      actorUserId: 'u1',
      summaryText: '📌 คุณได้รับมอบหมายงานใหม่\nงาน: ทดสอบ',
      entityPath: '/todos',
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u2', 'u3'] } },
      select: { id: true, lineUserId: true },
    });
    expect(line.pushTo).toHaveBeenCalledTimes(1);
    expect(line.pushTo).toHaveBeenCalledWith(
      'L2',
      expect.stringContaining('https://app.example.com/todos'),
    );
  });

  it('does nothing when the only target is the actor', async () => {
    await svc.notifyAssigned({
      userIds: ['u1'],
      actorUserId: 'u1',
      summaryText: 'x',
      entityPath: '/x',
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('never throws when push fails', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u2', lineUserId: 'L2' }]);
    line.pushTo.mockRejectedValue(new Error('LINE down'));
    await expect(
      svc.notifyAssigned({ userIds: ['u2'], actorUserId: 'u1', summaryText: 'x', entityPath: '/x' }),
    ).resolves.toBeUndefined();
  });

  it('notifyFirmOwners resolves owners then DMs them', async () => {
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'o1' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'o1', lineUserId: 'LO' }]);
    await svc.notifyFirmOwners({
      firmId: 'f1',
      actorUserId: 'u1',
      summaryText: 'เบิกใหม่',
      entityPath: '/admin/reimbursements',
    });
    expect(prisma.firmMember.findMany).toHaveBeenCalledWith({
      where: { firmId: 'f1', role: 'OWNER' },
      select: { userId: true },
    });
    expect(line.pushTo).toHaveBeenCalledWith('LO', expect.stringContaining('เบิกใหม่'));
  });
});
