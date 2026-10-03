import { AssignmentNotifierService } from './assignment-notifier.service';
import { FirmLinkService } from './firm-link.service';

const CASE_ID = '11111111-2222-3333-4444-555555555555';

const prisma = {
  user: { findMany: jest.fn() },
  firmMember: { findMany: jest.fn() },
  notification: { createManyAndReturn: jest.fn() },
} as any;
const line = { pushTo: jest.fn() } as any;
const push = { send: jest.fn() } as any;
const center = { channelsFor: jest.fn(), unreadCounts: jest.fn() } as any;
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

const allOn = (ids: string[]) => new Map(ids.map((id) => [id, { push: true, line: true }]));

describe('AssignmentNotifierService', () => {
  let svc: AssignmentNotifierService;
  beforeEach(() => {
    jest.clearAllMocks();
    line.pushTo.mockResolvedValue(true);
    push.send.mockResolvedValue(true);
    firmPrisma.firm.findUnique.mockResolvedValue({ slug: 'acme' });
    center.channelsFor.mockImplementation(async (ids: string[]) => allOn(ids));
    center.unreadCounts.mockResolvedValue(new Map([['u2', 3]]));
    prisma.notification.createManyAndReturn.mockImplementation(async ({ data }: any) =>
      data.map((row: any) => ({ id: `n-${row.userId}`, userId: row.userId })),
    );
    svc = new AssignmentNotifierService(prisma, line, new FirmLinkService(firmPrisma, config), push, center);
  });

  const users = [
    { id: 'u2', lineUserId: 'L2', firmMembers: [] },
    { id: 'u3', lineUserId: null, firmMembers: [] },
  ];

  it('records an inbox row, pushes and DMs every recipient except the actor', async () => {
    prisma.user.findMany.mockResolvedValue(users);
    const result = await svc.notifyAssigned({
      firmId: 'f1',
      userIds: ['u1', 'u2', 'u3'],
      actorUserId: 'u1',
      category: 'CASE',
      summaryText: '⚖️ คุณได้รับมอบหมายคดี\nคดี: ทดสอบ',
      entityPath: `/cases/${CASE_ID}?tab=tasks`,
    });

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['u2', 'u3'] }, firmMembers: { some: { firmId: 'f1' } } });
    expect(prisma.notification.createManyAndReturn.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ userId: 'u2', firmId: 'f1', category: 'CASE', title: '⚖️ คุณได้รับมอบหมายคดี', body: 'คดี: ทดสอบ', appPath: `/case/${CASE_ID}` }),
      expect.objectContaining({ userId: 'u3' }),
    ]);
    expect(push.send).toHaveBeenCalledWith([
      expect.objectContaining({ userId: 'u2', badge: 3, data: { url: `/case/${CASE_ID}`, notificationId: 'n-u2' } }),
      expect.objectContaining({ userId: 'u3', badge: 0, data: { url: `/case/${CASE_ID}`, notificationId: 'n-u3' } }),
    ]);
    expect(line.pushTo).toHaveBeenCalledTimes(1);
    expect(line.pushTo).toHaveBeenCalledWith('L2', expect.stringContaining(`https://acme.example.com/cases/${CASE_ID}?tab=tasks`), undefined);
    expect(result).toEqual({ recipients: 2, push: true, line: true });
  });

  it('an explicit appPath wins over the mapped web path', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'TASK',
      summaryText: 'งานใหม่', entityPath: '/todos', appPath: '/task/new?id=t1',
    });
    expect(push.send.mock.calls[0][0][0].data.url).toBe('/task/new?id=t1');
  });

  it('honours per-category opt-outs but always keeps the inbox row', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    center.channelsFor.mockResolvedValue(new Map([['u2', { push: false, line: false }]]));
    const result = await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: 'u1', category: 'COMMENT', summaryText: 'x', entityPath: '/todos',
    });
    expect(prisma.notification.createManyAndReturn).toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
    expect(result).toEqual({ recipients: 1, push: false, line: false });
  });

  it('line:false leaves LINE to the caller', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'LEAVE', summaryText: 'x', entityPath: '/leaves', line: false,
    });
    expect(push.send).toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('does nothing when the only target is the actor', async () => {
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u1'], actorUserId: 'u1', category: 'TASK', summaryText: 'x', entityPath: '/x',
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('still pushes and DMs when the inbox write fails', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    prisma.notification.createManyAndReturn.mockRejectedValue(new Error('db down'));
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2'], actorUserId: 'u1', category: 'TASK', summaryText: 'x', entityPath: '/todos',
    });
    expect(push.send.mock.calls[0][0][0].data).toEqual({ url: '/(tabs)/tasks' });
    expect(line.pushTo).toHaveBeenCalled();
  });

  it('never throws when every channel fails', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    line.pushTo.mockRejectedValue(new Error('LINE down'));
    push.send.mockRejectedValue(new Error('Expo down'));
    await expect(
      svc.notifyAssigned({ firmId: 'f1', userIds: ['u2'], actorUserId: 'u1', category: 'TASK', summaryText: 'x', entityPath: '/x' }),
    ).resolves.toEqual({ recipients: 1, push: false, line: false });
  });

  it('notifyFirmOwners resolves owners then notifies them', async () => {
    prisma.firmMember.findMany.mockResolvedValue([{ userId: 'o1' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'o1', lineUserId: 'LO', firmMembers: [] }]);
    await svc.notifyFirmOwners({
      firmId: 'f1', actorUserId: 'u1', category: 'BILLING', summaryText: 'เบิกใหม่', entityPath: '/admin/reimbursements',
    });
    expect(prisma.firmMember.findMany).toHaveBeenCalledWith({
      where: { firmId: 'f1', role: 'OWNER' },
      select: { userId: true },
    });
    expect(line.pushTo).toHaveBeenCalledWith('LO', expect.stringContaining('เบิกใหม่'), undefined);
    expect(push.send.mock.calls[0][0][0].data.url).toBe('/expenses/claims');
  });

  it('without a firm, files each recipient under their own firm', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'a', lineUserId: null, firmMembers: [{ firmId: 'f-a' }] },
      { id: 'b', lineUserId: null, firmMembers: [{ firmId: 'f-b' }] },
    ]);
    await svc.notifyAssigned({ firmId: null, userIds: ['a', 'b'], actorUserId: '', category: 'TASK', summaryText: 'x', entityPath: '/todos' });
    const rows = prisma.notification.createManyAndReturn.mock.calls.flatMap((call: any) => call[0].data);
    expect(rows.map((r: any) => [r.userId, r.firmId])).toEqual([['a', 'f-a'], ['b', 'f-b']]);
  });

  it('clips push text to fit Expo while the inbox keeps it whole', async () => {
    prisma.user.findMany.mockResolvedValue([users[0]]);
    const long = 'ก'.repeat(4000);
    await svc.notifyAssigned({ firmId: 'f1', userIds: ['u2'], actorUserId: '', category: 'CLIENT', summaryText: `หัวข้อ\n${long}`, entityPath: '/todos' });
    expect(push.send.mock.calls[0][0][0].body.length).toBe(400);
    expect(prisma.notification.createManyAndReturn.mock.calls[0][0].data[0].body).toBe(long);
  });

  it('attaches LINE buttons only to the recipients they are for', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u2', lineUserId: 'L2', firmMembers: [] },
      { id: 'u4', lineUserId: 'L4', firmMembers: [] },
    ]);
    const buttons = [{ label: 'ok', text: 'ok', data: 'task:ack:x' }];
    await svc.notifyAssigned({
      firmId: 'f1', userIds: ['u2', 'u4'], actorUserId: '', category: 'TASK', summaryText: 'x', entityPath: '/todos',
      lineActions: (userId) => (userId === 'u2' ? buttons : undefined),
    });
    expect(line.pushTo).toHaveBeenCalledWith('L2', expect.any(String), buttons);
    expect(line.pushTo).toHaveBeenCalledWith('L4', expect.any(String), undefined);
  });
});
