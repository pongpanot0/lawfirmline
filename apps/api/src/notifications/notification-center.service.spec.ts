import { NotificationCenterService } from './notification-center.service';

const prisma = {
  notification: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  userNotificationPreference: { findMany: jest.fn(), upsert: jest.fn() },
} as any;

const row = (id: string) => ({ id, title: id });

describe('NotificationCenterService', () => {
  let svc: NotificationCenterService;
  beforeEach(() => {
    jest.clearAllMocks();
    svc = new NotificationCenterService(prisma);
  });

  it('pages 30 at a time and hands back the last id as the cursor', async () => {
    prisma.notification.findMany.mockResolvedValue(Array.from({ length: 31 }, (_, i) => row(`n${i}`)));
    const page = await svc.list('u1', 'f1');
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBe('n29');
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'u1', firmId: 'f1' }, take: 31 });
  });

  it('continues after the cursor and stops on the last page', async () => {
    prisma.notification.findMany.mockResolvedValue([row('n30')]);
    const page = await svc.list('u1', 'f1', 'n29');
    expect(prisma.notification.findMany.mock.calls[0][0]).toMatchObject({ cursor: { id: 'n29' }, skip: 1 });
    expect(page.nextCursor).toBeNull();
  });

  it('marks read only the caller’s own row', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await svc.markRead('u1', 'n1');
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: 'n1', userId: 'u1', readAt: null });
  });

  it('read-all is limited to the current firm', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 4 });
    await expect(svc.markAllRead('u1', 'f1')).resolves.toEqual({ count: 4 });
    expect(prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ userId: 'u1', firmId: 'f1', readAt: null });
  });

  it('counts unread per recipient for the push badge', async () => {
    prisma.notification.groupBy.mockResolvedValue([{ userId: 'a', _count: { _all: 2 } }]);
    const counts = await svc.unreadCounts(['a', 'b'], 'f1');
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBeUndefined();
  });

  it('every category is on until the user saves an opt-out', async () => {
    prisma.userNotificationPreference.findMany.mockResolvedValue([{ userId: 'a', category: 'TASK', push: false, line: true }]);
    const prefs = await svc.preferences('a');
    expect(prefs).toHaveLength(7);
    expect(prefs.find((p) => p.category === 'TASK')).toEqual({ category: 'TASK', push: false, line: true });
    expect(prefs.find((p) => p.category === 'LEAVE')).toEqual({ category: 'LEAVE', push: true, line: true });

    const channels = await svc.channelsFor(['a', 'b'], 'TASK');
    expect(channels.get('a')).toEqual({ push: false, line: true });
    expect(channels.get('b')).toEqual({ push: true, line: true });
  });

  it('a partial change keeps the other channel on a first save', async () => {
    prisma.userNotificationPreference.upsert.mockResolvedValue({ push: false, line: true });
    await svc.setPreference('a', 'CALENDAR', { push: false });
    expect(prisma.userNotificationPreference.upsert.mock.calls[0][0]).toMatchObject({
      create: { userId: 'a', category: 'CALENDAR', push: false, line: true },
      update: { push: false },
    });
  });

  it('prunes rows older than 90 days', async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    const before = Date.now();
    await svc.prune();
    const cutoff: Date = prisma.notification.deleteMany.mock.calls[0][0].where.createdAt.lt;
    expect(Math.round((before - cutoff.getTime()) / 86_400_000)).toBe(90);
  });
});
