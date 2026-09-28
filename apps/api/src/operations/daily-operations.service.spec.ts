import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { DailyOperationsService, dailyTaskScope } from './daily-operations.service';

describe('Owner daily operations', () => {
  const owner = { id: 'owner', firmId: 'firm', firmRole: FirmRole.OWNER } as AuthUser;
  const dueDate = new Date('2026-10-01T02:00:00Z');
  const rows = [{ id: 'a', assigneeId: 'worker', status: 'TODO', queuePosition: 0, dueDate }, { id: 'b', assigneeId: 'worker', status: 'TODO', queuePosition: 1, dueDate }];
  const prisma = {
    task: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    taskComment: { create: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const notifier = { notifyAssigned: jest.fn() };
  const service = new DailyOperationsService(prisma as any, {} as any, notifier as any, {} as any);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.task.findFirst.mockResolvedValue(rows[1]);
    prisma.task.findMany.mockResolvedValue([...rows]);
    prisma.$transaction.mockImplementation((action) => action(prisma));
  });
  it('refuses firm-wide reads for ordinary lawyers before querying data', async () => {
    await expect(service.board({ ...owner, firmRole: FirmRole.LAWYER }, '2026-09-27')).rejects.toThrow(ForbiddenException);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
  });
  it('keeps explicit firm scope and omits ambiguous legacy multi-firm personal work', () => {
    expect(dailyTaskScope('firm')).toMatchObject({ OR: expect.arrayContaining([
      { firmId: 'firm', OR: [{ caseId: null }, { case: { firmId: 'firm', deletedAt: null } }] }, { firmId: null, caseId: null, intakeId: null, createdBy: { firmMembers: { some: { firmId: 'firm' }, every: { firmId: 'firm' } } } },
    ]) });
  });
  it('moves a task up transactionally without changing deadlines or assignees', async () => {
    await expect(service.move(owner, 'b', 'UP')).resolves.toEqual({ changed: true });
    expect(prisma.task.update.mock.calls).toEqual([
      [{ where: { id: 'b' }, data: { queuePosition: 0 } }],
      [{ where: { id: 'a' }, data: { queuePosition: 1 } }],
    ]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [dailyTaskScope('firm'), { assigneeId: 'worker', status: { notIn: ['DONE', 'PENDING_REVIEW'] } }] } }));
  });
  it('cannot move another firm’s task or wrap the first item to the end', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(service.move(owner, 'foreign', 'UP')).rejects.toThrow(NotFoundException);
    prisma.task.findFirst.mockResolvedValue(rows[0]);
    await expect(service.move(owner, 'a', 'UP')).resolves.toEqual({ changed: false });
    expect(prisma.task.update).not.toHaveBeenCalled();
  });
  it('buckets a member\'s week by planned day with size points, hearings, leave, and reviews apart', async () => {
    const radarPrisma = {
      firmMember: { findMany: jest.fn().mockResolvedValue([{ userId: 'w', role: 'LAWYER', user: { firstName: 'W', lastName: 'L' } }]) },
      task: { findMany: jest.fn().mockResolvedValue([
        { assigneeId: 'w', status: 'TODO', size: 'L', scheduledFor: new Date('2026-09-28T00:00:00Z'), dueDate: null },
        // no plan day: falls back to the deadline's Bangkok day (01:00 BKK on the 29th)
        { assigneeId: 'w', status: 'TODO', size: 'M', scheduledFor: null, dueDate: new Date('2026-09-28T18:00:00Z') },
        { assigneeId: 'w', status: 'IN_PROGRESS', size: 'S', scheduledFor: null, dueDate: null },
        { assigneeId: 'w', status: 'PENDING_REVIEW', size: 'L', scheduledFor: null, dueDate: null },
      ]) },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([{ userId: 'w', startDate: new Date('2026-09-30T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') }]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([{ startAt: new Date('2026-09-28T02:00:00Z'), assigneeId: null, assignees: [], case: { leadLawyerId: 'w' } }]) },
    };
    const radar = await new DailyOperationsService(radarPrisma as any, {} as any, {} as any, {} as any).radar(owner, '2026-09-28');
    const w = radar.members[0];
    expect(radar.days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(w).toMatchObject({ openCount: 3, openPoints: 7, reviewCount: 1, unscheduledCount: 1 });
    expect(w.days[0]).toEqual({ date: '2026-09-28', taskCount: 1, points: 4, eventCount: 1, onLeave: false });
    expect(w.days[1]).toMatchObject({ taskCount: 1, points: 2 });
    expect(w.days[2].onLeave).toBe(true);
  });
  it('shows a colleague\'s load to any member but hides work in cases they cannot open, and why someone is on leave', async () => {
    const lawyer = { id: 'me', firmId: 'firm', firmRole: FirmRole.LAWYER } as AuthUser;
    const p = {
      firmMember: { findUnique: jest.fn().mockResolvedValue({ role: 'LAWYER', taskWorkTypes: [], user: { firstName: 'W', lastName: 'L' } }) },
      task: { findMany: jest.fn().mockResolvedValue([
        { id: 't1', title: 'ลับ', status: 'TODO', size: 'L', caseId: 'secret', case: { id: 'secret', ownRef: 'X', title: 'คดีลับ' }, dueDate: null, scheduledFor: null, onHold: null },
        { id: 't2', title: 'ร่วมกัน', status: 'TODO', size: 'M', caseId: 'shared', case: { id: 'shared', ownRef: 'S', title: 'คดีร่วม' }, dueDate: null, scheduledFor: null, onHold: null },
        { id: 't3', title: 'ส่วนตัว', status: 'TODO', size: 'S', caseId: null, case: null, dueDate: null, scheduledFor: null, onHold: null },
      ]) },
      case: { findMany: jest.fn()
        .mockResolvedValueOnce([{ id: 'secret', ownRef: 'X', title: 'คดีลับ', status: 'OPEN', leadLawyerId: 'w' }, { id: 'shared', ownRef: 'S', title: 'คดีร่วม', status: 'OPEN', leadLawyerId: 'w' }])
        .mockResolvedValueOnce([{ id: 'shared' }]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([{ id: 'e1', title: 'สืบพยานคดีลับ', caseId: 'secret', startAt: new Date(), endAt: null, courtName: 'ศาลแพ่ง', assigneeId: 'w', assignees: [], case: { leadLawyerId: 'w' } }]) },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([{ id: 'l', type: 'SICK', startDate: new Date('2026-09-30T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') }]) },
    };
    const caseAccess = { getCaseFilterForUser: jest.fn().mockReturnValue({ firmId: 'firm' }) };
    const view = await new DailyOperationsService(p as any, {} as any, {} as any, caseAccess as any).person(lawyer, 'w');
    expect(view.tasks.map((t) => [t.title, t.case?.id ?? null, t.size])).toEqual([['งานที่คุณไม่มีสิทธิ์ดู', null, 'L'], ['ร่วมกัน', 'shared', 'M'], ['งานที่คุณไม่มีสิทธิ์ดู', null, 'S']]);
    expect(view.cases.map((c) => c.id)).toEqual(['shared']);
    expect(view.hiddenCaseCount).toBe(1);
    expect(view.events[0]).toMatchObject({ title: 'ติดนัด', courtName: null });
    expect(view.leaves[0].type).toBeNull();
  });
  it('sizes an open firm task and refuses done or foreign ones', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(rows[0]);
    await service.size(owner, 'a', 'L' as any);
    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { size: 'L' }, select: { id: true, size: true } });
    prisma.task.findFirst.mockResolvedValueOnce({ ...rows[0], status: 'DONE' });
    await expect(service.size(owner, 'a', 'S' as any)).rejects.toThrow('งานที่เสร็จแล้ว');
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(service.size(owner, 'foreign', 'S' as any)).rejects.toThrow(NotFoundException);
    await expect(service.size({ ...owner, firmRole: FirmRole.LAWYER }, 'a', 'S' as any)).rejects.toThrow(ForbiddenException);
  });
  it('follows up once per day: note on the task plus a DM to the worker only', async () => {
    prisma.task.findFirst.mockResolvedValueOnce({ ...rows[0], title: 'ร่างคำฟ้อง', caseId: 'c1' });
    prisma.taskComment.findFirst.mockResolvedValueOnce(null);
    prisma.taskComment.create.mockResolvedValueOnce({ createdAt: new Date('2026-09-28T03:00:00Z') });
    await expect(service.followUp(owner, 'a')).resolves.toMatchObject({ alreadySent: false });
    expect(prisma.taskComment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ taskId: 'a', kind: 'FOLLOW_UP', authorId: 'owner' }) });
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['worker'], entityPath: '/cases/c1' }));

    jest.clearAllMocks();
    prisma.task.findFirst.mockResolvedValueOnce(rows[0]);
    prisma.taskComment.findFirst.mockResolvedValueOnce({ createdAt: new Date() });
    await expect(service.followUp(owner, 'a')).resolves.toMatchObject({ alreadySent: true });
    expect(prisma.taskComment.create).not.toHaveBeenCalled();
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();

    prisma.task.findFirst.mockResolvedValueOnce({ ...rows[0], status: 'PENDING_REVIEW' });
    await expect(service.followUp(owner, 'a')).rejects.toThrow('ยังไม่ส่ง');
  });
});
