import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { DailyOperationsService, dailyTaskScope } from './daily-operations.service';

describe('Owner daily operations', () => {
  const owner = { id: 'owner', firmId: 'firm', firmRole: FirmRole.OWNER } as AuthUser;
  const dueDate = new Date('2026-10-01T02:00:00Z');
  const rows = [{ id: 'a', assigneeId: 'worker', status: 'TODO', queuePosition: 0, dueDate }, { id: 'b', assigneeId: 'worker', status: 'TODO', queuePosition: 1, dueDate }];
  const prisma = {
    task: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    taskComment: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new DailyOperationsService(prisma as any, {} as any);
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
        { assigneeId: 'w', status: 'TODO', size: null, scheduledFor: null, dueDate: new Date('2026-09-28T18:00:00Z') },
        { assigneeId: 'w', status: 'IN_PROGRESS', size: 'S', scheduledFor: null, dueDate: null },
        { assigneeId: 'w', status: 'PENDING_REVIEW', size: 'L', scheduledFor: null, dueDate: null },
      ]) },
      leaveRequest: { findMany: jest.fn().mockResolvedValue([{ userId: 'w', startDate: new Date('2026-09-30T00:00:00Z'), endDate: new Date('2026-09-30T00:00:00Z') }]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([{ startAt: new Date('2026-09-28T02:00:00Z'), assigneeId: null, assignees: [], case: { leadLawyerId: 'w' } }]) },
    };
    const radar = await new DailyOperationsService(radarPrisma as any, {} as any).radar(owner, '2026-09-28');
    const w = radar.members[0];
    expect(radar.days).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(w).toMatchObject({ openCount: 3, openPoints: 7, reviewCount: 1, unscheduledCount: 1 });
    expect(w.days[0]).toEqual({ date: '2026-09-28', taskCount: 1, points: 4, eventCount: 1, onLeave: false });
    expect(w.days[1]).toMatchObject({ taskCount: 1, points: 2 });
    expect(w.days[2].onLeave).toBe(true);
  });
  it('refuses the radar and person view to non-owners', async () => {
    await expect(service.radar({ ...owner, firmRole: FirmRole.LAWYER }, '2026-09-28')).rejects.toThrow(ForbiddenException);
    await expect(service.person({ ...owner, firmRole: FirmRole.LAWYER }, 'w')).rejects.toThrow(ForbiddenException);
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
});
