import { FirmRole } from '@lawfirm/shared';
import { DailyOperationsService } from './daily-operations.service';
import { TeamWorkloadController } from './daily-operations.controller';
import { REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';

const user = { id: 'member', firmId: 'firm', firmRole: FirmRole.LAWYER } as any;

describe('member-visible assignee loads', () => {
  const prisma = { firmMember: { findMany: jest.fn() }, case: { findMany: jest.fn() }, task: { groupBy: jest.fn() }, leaveRequest: { findMany: jest.fn() } };
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-10T18:00:00Z')); // Nov 11 in Bangkok
  });
  afterEach(() => jest.useRealTimers());
  it('counts each lead/buddy case once, sorts by cases then overdue then name and returns nearest leave', async () => {
    prisma.firmMember.findMany.mockResolvedValue(['C', 'B', 'A', 'D'].map((name) => ({ userId: name, role: 'LAWYER', user: { firstName: name, lastName: 'L' } })));
    prisma.case.findMany.mockResolvedValue([
      { leadLawyerId: 'D', assignments: [{ userId: 'D' }, { userId: 'B' }] },
      { leadLawyerId: 'D', assignments: [{ userId: 'A' }, { userId: 'C' }] },
    ]);
    prisma.task.groupBy.mockResolvedValue([{ assigneeId: 'A', _count: { _all: 2 } }, { assigneeId: 'D', _count: { _all: 0 } }]);
    prisma.leaveRequest.findMany.mockResolvedValue([
      { userId: 'B', startDate: new Date('2026-11-11'), endDate: new Date('2026-11-12') },
      { userId: 'B', startDate: new Date('2026-11-15'), endDate: new Date('2026-11-16') },
    ]);
    const result = await (new DailyOperationsService(prisma as any, {} as any, {} as any, {} as any)).assignees(user);
    expect(result.map((r) => r.userId)).toEqual(['B', 'C', 'A', 'D']);
    expect(result[0]).toEqual({ userId: 'B', firstName: 'B', lastName: 'L', firmRole: 'LAWYER', openCaseCount: 1, overdueTaskCount: 0, leave: { startDate: '2026-11-11', endDate: '2026-11-12' } });
    expect(result[2]).toMatchObject({ overdueTaskCount: 2, leave: null });
    expect(result[3].openCaseCount).toBe(2);
    expect(prisma.firmMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'firm', role: { not: 'EXTERNAL' } } }));
    expect(prisma.case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ firmId: 'firm', deletedAt: null, status: { notIn: ['CLOSED', 'ARCHIVED'] } }) }));
    expect(prisma.task.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: 'DONE' }, skippedAt: null, skippedReason: null, dueDate: { lt: new Date() } }) }));
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ firmId: 'firm', status: 'APPROVED', endDate: { gte: new Date('2026-11-11') }, startDate: { lte: new Date('2026-11-25') } }), orderBy: [{ startDate: 'asc' }, { id: 'asc' }] }));
  });
  it('declares the route on the member-visible controller without operations capability', () => {
    const handler = (TeamWorkloadController.prototype as any).assignees;
    expect(handler).toBeDefined();
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, TeamWorkloadController)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler)).toBeUndefined();
  });
});
