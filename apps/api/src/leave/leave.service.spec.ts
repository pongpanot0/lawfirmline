import { LeaveType, Prisma } from '../generated/prisma';
import { LeaveService } from './leave.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';

describe('LeaveService notices', () => {
  it('sends Monday, three-day and day-of notices only to other linked firm members, once each', async () => {
    const monday = new Date('2026-09-28T01:00:00Z'); // 08:00 Bangkok
    const alice = { id: 'a', firmId: 'firm-a', userId: 'alice', type: LeaveType.PERSONAL, startDate: new Date('2026-09-28'), endDate: new Date('2026-09-28'), user: { firstName: 'Alice', lastName: 'A' } };
    const bob = { id: 'b', firmId: 'firm-a', userId: 'bob', type: LeaveType.VACATION, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-01'), user: { firstName: 'Bob', lastName: 'B' } };
    const logs = new Set<string>();
    const prisma = {
      leaveRequest: { findMany: jest.fn(async ({ where }: any) => where.type === LeaveType.SICK ? [] : [alice, bob]) },
      firmMember: { findMany: jest.fn(async () => [
        { userId: 'alice', user: { lineUserId: 'line-alice' } },
        { userId: 'bob', user: { lineUserId: 'line-bob' } },
        { userId: 'unlinked', user: { lineUserId: null } },
      ]) },
      leaveNoticeLog: {
        create: jest.fn(async ({ data }: any) => {
          if (logs.has(data.key)) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
          logs.add(data.key);
        }),
        update: jest.fn(async () => undefined),
        updateMany: jest.fn(async () => ({ count: 0 })),
        deleteMany: jest.fn(async () => undefined),
      },
    } as any;
    const line = { sendText: jest.fn(async () => true) } as any;
    const service = new LeaveService(prisma, line);

    await service.sendNotices(monday);
    await service.sendNotices(monday);

    expect(line.sendText).toHaveBeenCalledTimes(4);
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('Bob B · พักร้อน'), ['line-alice']);
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('Alice A · ลากิจ'), ['line-bob']);
    expect(line.sendText.mock.calls.every(([, ids]: [string, string[]]) => ids.length === 1 && ids[0] !== null)).toBe(true);
  });

  it('records a sick day and immediately messages only other members of that firm', async () => {
    const today = bangkokDayKey(new Date());
    const leave = { id: 'sick-1', firmId: 'firm-a', userId: 'alice', type: LeaveType.SICK,
      startDate: new Date(today), endDate: new Date(today), user: { firstName: 'Alice', lastName: 'A' } };
    const prisma = {
      firmMember: {
        findUnique: jest.fn(async () => ({ userId: 'alice' })),
        findMany: jest.fn(async ({ where }: any) => {
          expect(where.firmId).toBe('firm-a');
          return [
            { userId: 'alice', user: { lineUserId: 'line-alice' } },
            { userId: 'bob', user: { lineUserId: 'line-bob' } },
          ];
        }),
      },
      leaveRequest: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => leave),
      },
      leaveNoticeLog: { create: jest.fn(async () => undefined), update: jest.fn(async () => undefined) },
    } as any;
    const line = { sendText: jest.fn(async () => true) } as any;

    await new LeaveService(prisma, line).create({ id: 'alice', firmId: 'firm-a' } as any,
      { type: LeaveType.SICK, startDate: today, endDate: today });

    expect(line.sendText).toHaveBeenCalledTimes(1);
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('Alice A · ลาป่วย'), ['line-bob']);
  });
});
