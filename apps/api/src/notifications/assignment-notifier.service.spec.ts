import { AssignmentNotifierService } from './assignment-notifier.service';
import { FirmLinkService } from './firm-link.service';

const prisma = {
  user: { findMany: jest.fn() },
  firmMember: { findMany: jest.fn() },
} as any;
const line = { pushTo: jest.fn().mockResolvedValue(true) } as any;
const config = {
  get: jest.fn((key: string) =>
    key === 'ROOT_DOMAIN' ? 'example.com' : 'https://app.example.com',
  ),
} as any;
// Real FirmLinkService over a stub Prisma: the point of these tests is the link
// the recipient receives, so the slug must actually reach the URL.
const firmPrisma = {
  firm: { findUnique: jest.fn().mockResolvedValue({ slug: 'acme' }) },
} as any;

describe('AssignmentNotifierService', () => {
  let svc: AssignmentNotifierService;
  beforeEach(() => {
    jest.clearAllMocks();
    line.pushTo.mockResolvedValue(true);
    firmPrisma.firm.findUnique.mockResolvedValue({ slug: 'acme' });
    svc = new AssignmentNotifierService(
      prisma,
      line,
      config,
      new FirmLinkService(firmPrisma, config),
    );
  });

  it('DMs linked users, skipping the actor and unlinked users', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', lineUserId: 'L2' },
      { id: 'u3', lineUserId: null },
    ]);
    await svc.notifyAssigned({
      firmId: 'f1',
      userIds: ['u1', 'u2', 'u3'],
      actorUserId: 'u1',
      summaryText: '📌 คุณได้รับมอบหมายงานใหม่\nงาน: ทดสอบ',
      entityPath: '/todos',
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u2', 'u3'] } },
      select: {
        id: true,
        lineUserId: true,
        firmMembers: { select: { firmId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
      },
    });
    expect(line.pushTo).toHaveBeenCalledTimes(1);
    expect(line.pushTo).toHaveBeenCalledWith(
      'L2',
      expect.stringContaining('https://acme.example.com/todos'),
    );
  });

  it('does nothing when the only target is the actor', async () => {
    await svc.notifyAssigned({
      firmId: 'f1',
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
      svc.notifyAssigned({
        firmId: 'f1',
        userIds: ['u2'],
        actorUserId: 'u1',
        summaryText: 'x',
        entityPath: '/x',
      }),
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
