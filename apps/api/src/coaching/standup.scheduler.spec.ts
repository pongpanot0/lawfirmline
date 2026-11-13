import { StandupScheduler } from './standup.scheduler';
import { StandupService } from './standup.service';

const now = new Date('2026-11-13T01:30:00Z');
function build() {
  const logged = new Set<string>();
  const db = {
    firmMember: { findMany: jest.fn().mockResolvedValue([{ firmId: 'f1', userId: 'u1' }]) },
    leaveRequest: { findMany: jest.fn().mockResolvedValue([]) }, publicHoliday: { findUnique: jest.fn().mockResolvedValue(null) },
    dailyStandup: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
    standupPromptLog: {
      findMany: jest.fn(async () => [...logged].map((userId) => ({ userId }))),
      create: jest.fn(async ({ data }: any) => { if (logged.has(data.userId)) throw { code: 'P2002' }; logged.add(data.userId); return data; }),
    },
    $transaction: jest.fn(),
  };
  db.firmMember.findMany.mockImplementation(async (args: any) => args.where.firmId ? [{ userId: 'u1', role: 'LAWYER' }] : [{ firmId: 'f1', userId: 'u1' }] as any);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
  const notifier = { record: jest.fn().mockResolvedValue({ id: 'n1' }), send: jest.fn().mockResolvedValue(undefined) };
  const standup = new StandupService(db as never);
  return { db, notifier, svc: new StandupScheduler(db as never, standup, notifier as never) };
}

describe('StandupScheduler', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());
  it('sends once and records the Bangkok date atomically with the inbox', async () => {
    const { db, notifier, svc } = build();
    await svc.sendPrompts(); await svc.sendPrompts();
    expect(notifier.record).toHaveBeenCalledTimes(1);
    expect(notifier.record).toHaveBeenCalledWith(db, 'f1', 'u1', 'STANDUP', 'เช็กอินเช้านี้', '/my-day');
    expect(notifier.send).toHaveBeenCalledTimes(1);
    expect(db.standupPromptLog.create).toHaveBeenCalledWith({ data: { userId: 'u1', day: new Date('2026-11-13') } });
  });
  it('unique claims prevent simultaneous duplicate sends', async () => {
    const { db, notifier, svc } = build(); db.standupPromptLog.findMany.mockResolvedValue([]);
    await Promise.all([svc.sendPrompts(), svc.sendPrompts()]);
    expect(notifier.record).toHaveBeenCalledTimes(1); expect(notifier.send).toHaveBeenCalledTimes(1);
  });
  it('skips approved leave', async () => {
    const { db, notifier, svc } = build(); db.leaveRequest.findMany.mockResolvedValue([{ userId: 'u1' }]);
    await svc.sendPrompts(); expect(notifier.record).not.toHaveBeenCalled();
  });
  it('skips public holidays', async () => {
    const { db, notifier, svc } = build(); db.publicHoliday.findUnique.mockResolvedValue({ date: new Date('2026-11-13') });
    await svc.sendPrompts(); expect(notifier.record).not.toHaveBeenCalled();
  });
  it.each(['2026-11-14T01:30:00Z', '2026-11-15T01:30:00Z'])('skips weekends %s', async (at) => {
    jest.setSystemTime(new Date(at)); const { db, notifier, svc } = build();
    await svc.sendPrompts(); expect(db.firmMember.findMany).not.toHaveBeenCalled(); expect(notifier.record).not.toHaveBeenCalled();
  });
  it.each(['CHECKED_IN', 'SKIPPED'])('skips users with a %s row', async (status) => {
    const { db, notifier, svc } = build(); db.dailyStandup.findMany.mockResolvedValue([{ userId: 'u1', status }] as never);
    await svc.sendPrompts(); expect(notifier.record).not.toHaveBeenCalled();
  });
  it('rechecks for an entry that arrived after the batch read', async () => {
    const { db, notifier, svc } = build(); db.dailyStandup.findUnique.mockResolvedValue({ id: 's1' });
    await svc.sendPrompts(); expect(notifier.record).not.toHaveBeenCalled();
  });
  it('continues to other users after one delivery fails', async () => {
    const { db, notifier, svc } = build();
    db.firmMember.findMany.mockImplementation(async (args: any) => args.where.firmId ? [{ userId: 'u1', role: 'LAWYER' }, { userId: 'u2', role: 'LAWYER' }] as any : [{ firmId: 'f1', userId: 'u1' }, { firmId: 'f1', userId: 'u2' }] as any);
    db.$transaction.mockRejectedValueOnce(new Error('db unavailable'));
    await svc.sendPrompts(); expect(notifier.record).toHaveBeenCalledWith(db, 'f1', 'u2', 'STANDUP', expect.any(String), '/my-day');
  });
});
