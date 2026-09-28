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
});
