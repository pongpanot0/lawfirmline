import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { LeaveStatus, LeaveType, Prisma } from '../generated/prisma';
import { LeaveService } from './leave.service';
import { bangkokDayKey } from '../common/utils/bangkok-time';
import { eventForUserWhere } from '../calendar/event-people';

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

describe('LeaveService approval workflow', () => {
  const owners = [
    { userId: 'owner-1', user: { lineUserId: 'line-owner-1' } },
    { userId: 'owner-2', user: { lineUserId: 'line-owner-2' } },
  ];
  const requester = { firstName: 'Alice', lastName: 'A' };

  function makePrisma(overrides: Partial<Record<string, any>> = {}) {
    return {
      firmMember: {
        findUnique: jest.fn(async () => ({ userId: 'alice' })),
        findMany: jest.fn(async () => owners),
      },
      leaveRequest: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({
          id: 'leave-1', firmId: 'firm-a', userId: 'alice', type: data.type, status: data.status,
          startDate: data.startDate, endDate: data.endDate, user: requester,
        })),
      },
      calendarEvent: { findMany: jest.fn(async () => []) },
      leaveNoticeLog: {
        create: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
        updateMany: jest.fn(async () => ({ count: 0 })),
        deleteMany: jest.fn(async () => undefined),
      },
      ...overrides,
    } as any;
  }

  it('a SICK request is created APPROVED and never triggers an owner approval push', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any,
      { type: LeaveType.SICK, startDate: '2026-10-05', endDate: '2026-10-05' },
    );
    expect(leave.status).toBe(LeaveStatus.APPROVED);
    expect(line.pushTo).not.toHaveBeenCalled();
  });

  it('a VACATION request filed by a LAWYER is created PENDING and pushes both owners a quick reply', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any,
      { type: LeaveType.VACATION, startDate: '2026-10-05', endDate: '2026-10-06' },
    );
    expect(leave.status).toBe(LeaveStatus.PENDING);
    expect(line.pushTo).toHaveBeenCalledTimes(2);
    expect(line.pushTo).toHaveBeenCalledWith('line-owner-1', expect.any(String), [
      expect.objectContaining({ data: 'leave:approve:leave-1' }),
      expect.objectContaining({ data: 'leave:reject:leave-1' }),
    ]);
    expect(line.pushTo).toHaveBeenCalledWith('line-owner-2', expect.any(String), expect.any(Array));
  });

  it('a request filed by an OWNER is created APPROVED regardless of type', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any,
      { type: LeaveType.VACATION, startDate: '2026-10-05', endDate: '2026-10-06' },
    );
    expect(leave.status).toBe(LeaveStatus.APPROVED);
  });

  function makeDecidePrisma(leave: any) {
    return {
      leaveRequest: {
        findFirst: jest.fn(async () => leave),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (leave.status !== where.status) return { count: 0 };
          leave = { ...leave, ...data };
          return { count: 1 };
        }),
        delete: jest.fn(async () => leave),
      },
      firmMember: { findMany: jest.fn(async () => [{ userId: 'bob', user: { lineUserId: 'line-bob' } }]) },
      leaveNoticeLog: {
        create: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
        updateMany: jest.fn(async () => ({ count: 0 })),
        deleteMany: jest.fn(async () => undefined),
      },
    } as any;
  }

  it('a non-owner cannot decide a leave request', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line).decide(
      { id: 'u1', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, 'leave-1', 'APPROVED',
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deciding an already-decided request is rejected', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.APPROVED, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line).decide(
      { id: 'u1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'APPROVED',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deciding notifies the requester by LINE', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: 'line-alice' } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    const decided = await new LeaveService(prisma, line).decide(
      { id: 'owner-1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'APPROVED',
    );
    expect(decided.status).toBe('APPROVED');
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('อนุมัติ'), ['line-alice']);
  });

  it('rejects a decision value other than APPROVED/REJECTED', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line).decide(
      { id: 'owner-1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'PENDING' as any,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it('loses the race: when another owner decided first the claim matches nothing, throws, and no push is sent', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: 'line-alice' } };
    const prisma = makeDecidePrisma(leave);
    prisma.leaveRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line).decide(
      { id: 'owner-2', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'REJECTED',
    )).rejects.toThrow('คำขอนี้ตัดสินไปแล้ว');
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING },
    }));
    expect(line.sendText).not.toHaveBeenCalled();
  });

  it.each([
    [LeaveStatus.APPROVED, 1],
    [LeaveStatus.PENDING, 0],
    [LeaveStatus.REJECTED, 0],
  ])('cancelling a %s leave broadcasts to members %i time(s)', async (status, sends) => {
    const leave = { id: 'leave-1', firmId: 'firm-a', userId: 'alice', type: LeaveType.VACATION, status, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { firstName: 'Alice', lastName: 'A' } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), pushTo: jest.fn(async () => true) } as any;
    await new LeaveService(prisma, line).cancel({ id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, 'leave-1');
    expect(prisma.leaveRequest.delete).toHaveBeenCalled();
    expect(line.sendText).toHaveBeenCalledTimes(sends);
  });

  it('findCourtConflicts matches events assigned to the person, or unassigned events on their lead case', async () => {
    const prisma = { calendarEvent: { findMany: jest.fn(async () => []) } } as any;
    const line = {} as any;
    await new LeaveService(prisma, line).findCourtConflicts('firm-a', 'alice', new Date('2026-10-05'), new Date('2026-10-06'));
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        case: { firmId: 'firm-a' },
        ...eventForUserWhere('alice'),
      }),
    }));
  });
});
