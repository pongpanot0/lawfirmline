import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { LeaveStatus, LeaveType, Prisma } from '../generated/prisma';
import { LeaveService } from './leave.service';
import { addBangkokDays, bangkokDayKey } from '../common/utils/bangkok-time';
import { eventForUserWhere } from '../calendar/event-people';

const notifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } as any;
const center = {
  channelsFor: jest.fn(async (ids: string[]) => new Map(ids.map((id) => [id, { push: true, line: !id.startsWith('muted') }]))),
} as any;

describe('LeaveService notices', () => {
  // Mon 28 Sep 2026: Alice (ลากิจ) and Carol (ลาป่วย) are out today, Bob (พักร้อน) starts Thursday.
  const person = (first: string) => ({ firstName: first, lastName: first[0] });
  const alice = { id: 'a', firmId: 'firm-a', userId: 'alice', type: LeaveType.PERSONAL, status: LeaveStatus.APPROVED, startDate: new Date('2026-09-28'), endDate: new Date('2026-09-28'), user: person('Alice') };
  const carol = { id: 'c', firmId: 'firm-a', userId: 'carol', type: LeaveType.SICK, status: LeaveStatus.APPROVED, startDate: new Date('2026-09-28'), endDate: new Date('2026-09-29'), user: person('Carol') };
  const bob = { id: 'b', firmId: 'firm-a', userId: 'bob', type: LeaveType.VACATION, status: LeaveStatus.APPROVED, startDate: new Date('2026-10-01'), endDate: new Date('2026-10-01'), user: person('Bob') };

  function setup(leaves: any[], holidays: string[] = []) {
    const logs = new Set<string>();
    const prisma = {
      leaveRequest: {
        findMany: jest.fn(async ({ where }: any) => leaves.filter((l) =>
          (!where.firmId || l.firmId === where.firmId) && l.status === LeaveStatus.APPROVED
          && l.startDate <= where.startDate.lte && l.endDate >= where.endDate.gte)),
      },
      publicHoliday: { findUnique: jest.fn(async ({ where }: any) => (holidays.includes(where.date.toISOString().slice(0, 10)) ? { id: 'h' } : null)) },
      firmMember: { findMany: jest.fn(async () => [
        { userId: 'alice', user: { lineUserId: 'line-alice' } },
        { userId: 'bob', user: { lineUserId: 'line-bob' } },
        { userId: 'carol', user: { lineUserId: 'line-carol' } },
        { userId: 'dave', user: { lineUserId: null } },
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
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const notify = { notifyAssigned: jest.fn(async () => undefined), notifyFirmOwners: jest.fn() } as any;
    return { prisma, line, notify, service: new LeaveService(prisma, line, notify, center) };
  }
  const textsTo = (line: any, id: string): string[] => line.sendText.mock.calls.filter(([, ids]: any) => ids[0] === id).map(([text]: any) => text as string);

  afterEach(() => jest.useRealTimers());

  it('08:00 on a working day: today, week and three-day rounds, all types, names only, LINE and app, once', async () => {
    const { line, notify, service } = setup([alice, carol, bob]);
    const monday = new Date('2026-09-28T01:00:00Z'); // 08:00 Bangkok
    await service.sendNotices(monday);
    await service.sendNotices(new Date('2026-09-28T01:10:00Z'));

    const toBob = textsTo(line, 'line-bob');
    expect(toBob.find((t) => t.startsWith('📅 วันนี้ไม่อยู่ ('))).toMatch(/• Alice A\n• Carol C$/);
    expect(toBob.some((t) => t.startsWith('📅 คนลาสัปดาห์นี้'))).toBe(true);
    expect(textsTo(line, 'line-alice').find((t) => t.startsWith('📅 วันนี้ไม่อยู่ ('))).toMatch(/• Carol C$/);
    expect(textsTo(line, 'line-alice').some((t) => t.startsWith('📅 แจ้งลาล่วงหน้า 3 วัน') && t.includes('Bob B'))).toBe(true);
    // Nobody but the approvers is told the type, and nobody hears about their own leave.
    const all = line.sendText.mock.calls.map(([text]: any) => text as string);
    expect(all.some((t: string) => /ลากิจ|ลาป่วย|พักร้อน/.test(t))).toBe(false);
    expect(textsTo(line, 'line-bob').some((t) => t.includes('Bob B'))).toBe(false);
    // 3 today + 3 week + 2 three-day, none repeated on the second run.
    expect(line.sendText).toHaveBeenCalledTimes(8);
    // The app gets each round once, including dave who has no LINE.
    const appTexts = notify.notifyAssigned.mock.calls.map(([p]: any) => p);
    expect(appTexts.filter((p: any) => p.summaryText.startsWith('📅 วันนี้ไม่อยู่')).flatMap((p: any) => p.userIds).sort()).toEqual(['alice', 'bob', 'carol', 'dave']);
    expect(appTexts.every((p: any) => p.category === 'LEAVE' && p.line === false)).toBe(true);
  });

  it('skips the today and week rounds on a public holiday; the three-day heads-up still goes', async () => {
    const { line, service } = setup([alice, carol, bob], ['2026-09-28']);
    await service.sendNotices(new Date('2026-09-28T01:00:00Z'));
    const all = line.sendText.mock.calls.map(([text]: any) => text as string);
    expect(all.some((t: string) => t.startsWith('📅 วันนี้ไม่อยู่') || t.startsWith('📅 คนลาสัปดาห์นี้'))).toBe(false);
    expect(all.some((t: string) => t.startsWith('📅 แจ้งลาล่วงหน้า 3 วัน'))).toBe(true);
  });

  it('skips the today round on a weekend', async () => {
    const saturday = { ...alice, startDate: new Date('2026-10-03'), endDate: new Date('2026-10-03') };
    const { line, service } = setup([saturday]);
    await service.sendNotices(new Date('2026-10-03T01:00:00Z'));
    expect(line.sendText).not.toHaveBeenCalled();
  });

  it('leave approved for today after 08:00 goes out at once as an add-on, only once', async () => {
    const late: any = { ...bob, status: LeaveStatus.PENDING, startDate: new Date('2026-09-29'), endDate: new Date('2026-09-29'), user: { ...person('Bob'), lineUserId: null } };
    const { prisma, line, service } = setup([{ ...alice, startDate: new Date('2026-09-29'), endDate: new Date('2026-09-29') }, late]); // Tuesday: no week round
    await service.sendNotices(new Date('2026-09-29T01:00:00Z'));
    line.sendText.mockClear();
    prisma.leaveRequest.findFirst = jest.fn(async () => late);
    prisma.leaveRequest.updateMany = jest.fn(async () => { late.status = LeaveStatus.APPROVED; return { count: 1 }; });
    jest.useFakeTimers({ now: new Date('2026-09-29T03:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }); // 10:00 Bangkok

    await service.decide({ id: 'owner-1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'b', 'APPROVED');
    await service.sendNotices(new Date('2026-09-29T03:10:00Z'));

    expect(textsTo(line, 'line-alice')).toEqual(['📅 วันนี้ไม่อยู่เพิ่ม\n• Bob B']);
    expect(textsTo(line, 'line-carol')).toEqual(['📅 วันนี้ไม่อยู่เพิ่ม\n• Bob B']);
    expect(textsTo(line, 'line-bob')).toEqual([]);
  });

  it('a sick day filed before 08:00 tells nobody until the morning round', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-28T00:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }); // 07:00 Bangkok
    const { prisma, line, service } = setup([]);
    prisma.firmMember.findUnique = jest.fn(async () => ({ userId: 'alice' }));
    prisma.leaveRequest.findFirst = jest.fn(async () => null);
    prisma.leaveRequest.create = jest.fn(async () => carol);
    await service.create({ id: 'carol', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, { type: LeaveType.SICK, startDate: '2026-09-28', endDate: '2026-09-28' });
    expect(line.sendText).not.toHaveBeenCalled();
    expect(line.push).not.toHaveBeenCalled();
  });

  it('cancelling approved leave tells the others without the type', async () => {
    const { prisma, line, service } = setup([]);
    prisma.leaveRequest.findFirst = jest.fn(async () => alice);
    prisma.leaveRequest.delete = jest.fn(async () => alice);
    await service.cancel({ id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, 'a');
    expect(textsTo(line, 'line-bob')).toEqual([expect.stringMatching(/^❌ ยกเลิกการลา\n• Alice A · /)]);
    expect(line.sendText.mock.calls.some(([text]: any) => text.includes('ลากิจ'))).toBe(false);
  });
});

describe('LeaveService.list visibility', () => {
  const own = { id: 'mine', firmId: 'firm-a', userId: 'me', type: LeaveType.VACATION, status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), decidedAt: null, decidedBy: null, user: { firstName: 'Me', lastName: 'M' } };
  const other = { id: 'theirs', firmId: 'firm-a', userId: 'bob', type: LeaveType.SICK, status: LeaveStatus.APPROVED, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), decidedAt: new Date(), decidedBy: { firstName: 'O', lastName: 'W' }, user: { firstName: 'Bob', lastName: 'B' } };
  const run = async (firmRole: FirmRole) => {
    const prisma = { leaveRequest: { findMany: jest.fn(async () => [own, other]) }, calendarEvent: { findMany: jest.fn(async () => []) } } as any;
    const result = await new LeaveService(prisma, {} as any, notifier, center).list({ id: 'me', firmId: 'firm-a', firmRole } as any, '2026-10-01', '2026-10-31');
    return { where: prisma.leaveRequest.findMany.mock.calls[0][0].where, result };
  };

  it('a member sees their own leave in full and others\' approved leave as name and dates only', async () => {
    const { where, result } = await run(FirmRole.LAWYER);
    expect(where.AND[0]).toEqual({ firmId: 'firm-a', OR: [{ userId: 'me' }, { status: LeaveStatus.APPROVED }] });
    expect(result[0]).toMatchObject({ id: 'mine', type: LeaveType.VACATION, courtConflicts: [] });
    expect(result[1]).toEqual({ id: 'theirs', userId: 'bob', status: LeaveStatus.APPROVED, startDate: other.startDate, endDate: other.endDate,
      user: other.user, type: null, decidedAt: null, decidedBy: null });
  });

  it.each([FirmRole.OWNER, FirmRole.OFFICE_MANAGER])('%s sees every leave in full', async (firmRole) => {
    const { where, result } = await run(firmRole);
    expect(where.AND[0]).toEqual({ firmId: 'firm-a' });
    expect(result[1]).toMatchObject({ type: LeaveType.SICK, decidedBy: other.decidedBy });
  });
});

describe('LeaveService approval workflow', () => {
  const owners = [
    { userId: 'owner-1', user: { lineUserId: 'line-owner-1' } },
    { userId: 'owner-2', user: { lineUserId: 'line-owner-2' } },
  ];
  const requester = { firstName: 'Alice', lastName: 'A' };
  // create() rejects past dates, so filings are relative to today (Bangkok).
  const inDays = (n: number) => bangkokDayKey(addBangkokDays(new Date(), n));

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

  it('list returns the name of who decided each leave', async () => {
    const prisma = makePrisma();
    prisma.leaveRequest.findMany = jest.fn(async () => []);
    await new LeaveService(prisma, {} as any, notifier, center).list(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, inDays(0), inDays(30),
    );
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ decidedBy: { select: { firstName: true, lastName: true } } }),
    }));
  });

  it('a SICK request is created APPROVED and never triggers an owner approval push', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line, notifier, center).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any,
      { type: LeaveType.SICK, startDate: inDays(1), endDate: inDays(1) },
    );
    expect(leave.status).toBe(LeaveStatus.APPROVED);
    expect(line.push).not.toHaveBeenCalled();
  });

  it('an audited (MCP) request writes the leave and its audit row in one transaction', async () => {
    const prisma = makePrisma({ auditLog: { create: jest.fn() } });
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await new LeaveService(prisma, line, notifier, center).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any,
      { type: LeaveType.VACATION, startDate: inDays(1), endDate: inDays(1) },
      (entityId) => ({ firmId: 'firm-a', userId: 'alice', action: 'mcp.request_leave', metadata: { entityId } }),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'mcp.request_leave', metadata: { entityId: 'leave-1' } }) });
  });

  it('a VACATION request filed by a LAWYER is created PENDING and pushes both owners a card with its own buttons', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line, notifier, center).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any,
      { type: LeaveType.VACATION, startDate: inDays(1), endDate: inDays(2) },
    );
    expect(leave.status).toBe(LeaveStatus.PENDING);
    expect(line.push).toHaveBeenCalledTimes(2);
    const [target, [card]] = line.push.mock.calls[0];
    expect(target).toBe('line-owner-1');
    expect(card.type).toBe('flex');
    expect(card.contents.body.contents.map((c: any) => c.text)).toContain('Alice A · พักร้อน');
    expect(card.contents.footer.contents.map((b: any) => b.action)).toEqual([
      expect.objectContaining({ type: 'postback', data: 'leave:approve:leave-1', displayText: expect.stringContaining('Alice A') }),
      expect.objectContaining({ type: 'postback', data: 'leave:reject:leave-1' }),
    ]);
    expect(line.push).toHaveBeenCalledWith('line-owner-2', [expect.objectContaining({ type: 'flex' })]);
  });

  it('a request filed by an OWNER is created APPROVED regardless of type', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line, notifier, center).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any,
      { type: LeaveType.VACATION, startDate: inDays(1), endDate: inDays(2) },
    );
    expect(leave.status).toBe(LeaveStatus.APPROVED);
  });

  it('a request filed by an OFFICE_MANAGER stays PENDING (only an owner auto-approves)', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const leave = await new LeaveService(prisma, line, notifier, center).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.OFFICE_MANAGER } as any,
      { type: LeaveType.VACATION, startDate: inDays(1), endDate: inDays(2) },
    );
    expect(leave.status).toBe(LeaveStatus.PENDING);
  });

  it('asks owners and office managers to approve a pending request', async () => {
    const prisma = makePrisma();
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await new LeaveService(prisma, line, notifier, center).create(
      { id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any,
      { type: LeaveType.VACATION, startDate: inDays(1), endDate: inDays(2) },
    );
    expect(prisma.firmMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: { in: ['OWNER', 'OFFICE_MANAGER'] } }),
    }));
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
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line, notifier, center).decide(
      { id: 'u1', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, 'leave-1', 'APPROVED',
    )).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('an OFFICE_MANAGER can decide another member\'s leave request', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', userId: 'alice', type: LeaveType.PERSONAL, status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const decided = await new LeaveService(prisma, line, notifier, center).decide(
      { id: 'om-1', firmId: 'firm-a', firmRole: FirmRole.OFFICE_MANAGER } as any, 'leave-1', 'APPROVED',
    );
    expect(decided.status).toBe('APPROVED');
  });

  it('deciding an already-decided request is rejected', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.APPROVED, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line, notifier, center).decide(
      { id: 'u1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'APPROVED',
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deciding notifies the requester by LINE', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', userId: 'alice', type: LeaveType.PERSONAL, status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: 'line-alice' } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    const decided = await new LeaveService(prisma, line, notifier, center).decide(
      { id: 'owner-1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'APPROVED',
    );
    expect(decided.status).toBe('APPROVED');
    expect(line.sendText).toHaveBeenCalledWith(expect.stringContaining('อนุมัติ'), ['line-alice']);
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({
      userIds: ['alice'], category: 'LEAVE', line: false, entityPath: '/leaves',
    }));
  });

  it('a requester who muted LEAVE on LINE still gets the decision in the app, not on LINE', async () => {
    const leave = { id: 'leave-2', firmId: 'firm-a', userId: 'muted-bob', type: LeaveType.PERSONAL, status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: 'line-bob' } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    notifier.notifyAssigned.mockClear();
    await new LeaveService(prisma, line, notifier, center).decide(
      { id: 'owner-1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-2', 'REJECTED',
    );
    expect(line.sendText).not.toHaveBeenCalled();
    expect(notifier.notifyAssigned.mock.calls[0][0].summaryText).toContain('ปฏิเสธ');
  });

  it('rejects a decision value other than APPROVED/REJECTED', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } };
    const prisma = makeDecidePrisma(leave);
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line, notifier, center).decide(
      { id: 'owner-1', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'PENDING' as any,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it('loses the race: when another owner decided first the claim matches nothing, throws, and no push is sent', async () => {
    const leave = { id: 'leave-1', firmId: 'firm-a', status: LeaveStatus.PENDING, startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: 'line-alice' } };
    const prisma = makeDecidePrisma(leave);
    prisma.leaveRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await expect(new LeaveService(prisma, line, notifier, center).decide(
      { id: 'owner-2', firmId: 'firm-a', firmRole: FirmRole.OWNER } as any, 'leave-1', 'REJECTED',
    )).rejects.toThrow('คำขอลานี้พิจารณาไปแล้ว');
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
    const line = { sendText: jest.fn(async () => true), push: jest.fn(async () => true) } as any;
    await new LeaveService(prisma, line, notifier, center).cancel({ id: 'alice', firmId: 'firm-a', firmRole: FirmRole.LAWYER } as any, 'leave-1');
    expect(prisma.leaveRequest.delete).toHaveBeenCalled();
    expect(line.sendText).toHaveBeenCalledTimes(sends);
  });

  it('findCourtConflicts matches events assigned to the person, or unassigned events on their lead case', async () => {
    const prisma = { calendarEvent: { findMany: jest.fn(async () => []) } } as any;
    const line = {} as any;
    await new LeaveService(prisma, line, notifier, center).findCourtConflicts('firm-a', 'alice', new Date('2026-10-05'), new Date('2026-10-06'));
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        case: { firmId: 'firm-a' },
        startAt: { gte: new Date('2026-10-04T17:00:00Z'), lt: new Date('2026-10-06T17:00:00Z') },
        ...eventForUserWhere('alice'),
      }),
    }));
  });
});

describe('LeaveService self-approval guard', () => {
  const inDays = (n: number) => bangkokDayKey(addBangkokDays(new Date(), n));
  const line = () => ({ sendText: jest.fn(async () => true), push: jest.fn(async () => true) }) as any;
  const pendingLeave = (userId: string) => ({ id: 'leave-1', firmId: 'firm-a', userId, type: LeaveType.PERSONAL, status: LeaveStatus.PENDING,
    startDate: new Date('2026-10-05'), endDate: new Date('2026-10-05'), user: { lineUserId: null } });
  const decidePrisma = (leave: any) => ({
    leaveRequest: { findFirst: jest.fn(async () => leave), updateMany: jest.fn(async () => ({ count: 1 })) },
  }) as any;

  it('an OFFICE_MANAGER cannot decide their own leave', async () => {
    const prisma = decidePrisma(pendingLeave('om-1'));
    await expect(new LeaveService(prisma, line(), notifier, center).decide(
      { id: 'om-1', firmId: 'firm-a', firmRole: FirmRole.OFFICE_MANAGER } as any, 'leave-1', 'APPROVED',
    )).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it('an OFFICE_MANAGER can decide someone else\'s leave', async () => {
    const prisma = decidePrisma(pendingLeave('alice'));
    const decided = await new LeaveService(prisma, line(), notifier, center).decide(
      { id: 'om-1', firmId: 'firm-a', firmRole: FirmRole.OFFICE_MANAGER } as any, 'leave-1', 'REJECTED',
    );
    expect(decided.status).toBe('REJECTED');
  });

  it('the LINE approval request skips the requester even when they can approve', async () => {
    const prisma = {
      firmMember: {
        findUnique: jest.fn(async () => ({ userId: 'om-1' })),
        findMany: jest.fn(async () => [
          { userId: 'owner-1', user: { lineUserId: 'line-owner-1' } },
          { userId: 'om-1', user: { lineUserId: 'line-om-1' } },
        ]),
      },
      leaveRequest: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'leave-1', firmId: 'firm-a', userId: 'om-1', type: data.type, status: data.status,
          startDate: data.startDate, endDate: data.endDate, user: { firstName: 'Om', lastName: 'M' } })),
      },
      calendarEvent: { findMany: jest.fn(async () => []) },
      leaveNoticeLog: { create: jest.fn(async () => undefined), update: jest.fn(async () => undefined) },
    } as any;
    const l = line();
    notifier.notifyFirmOwners.mockClear();
    await new LeaveService(prisma, l, notifier, center).create(
      { id: 'om-1', firmId: 'firm-a', firmRole: FirmRole.OFFICE_MANAGER } as any,
      { type: LeaveType.VACATION, startDate: inDays(1), endDate: inDays(2) },
    );
    expect(l.push).toHaveBeenCalledTimes(1);
    expect(l.push).toHaveBeenCalledWith('line-owner-1', [expect.objectContaining({ type: 'flex' })]);
    // In-app: every approver role, the requester dropped as the actor.
    expect(notifier.notifyFirmOwners).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'om-1', roles: [FirmRole.OWNER, FirmRole.OFFICE_MANAGER],
    }));
  });

  it.each([
    [FirmRole.OFFICE_MANAGER, { userId: { not: 'me' } }],
    [FirmRole.OWNER, {}],
  ])('pending() for %s filters own leave accordingly', async (firmRole, extra) => {
    const prisma = { leaveRequest: { findMany: jest.fn(async () => []) } } as any;
    await new LeaveService(prisma, line(), notifier, center).pending({ id: 'me', firmId: 'firm-a', firmRole } as any);
    expect(prisma.leaveRequest.findMany.mock.calls[0][0].where).toEqual({ firmId: 'firm-a', status: LeaveStatus.PENDING, ...extra });
  });
});
