import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { BillingService } from '../billing/billing.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const mockPrisma = {
    case: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    calendarEvent: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    task: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    expense: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const mockCaseAccess = {
    getCaseFilterForUser: jest.fn().mockReturnValue({ firmId: 'firm-1' }),
    getTaskFilterForUser: jest.fn().mockReturnValue({ assigneeId: 'user-1' }),
  };
  const mockBilling = { getCaseProfits: jest.fn().mockResolvedValue([]) };
  const user = {
    id: 'user-1',
    firmId: 'firm-1',
    firmName: 'Firm',
    role: 'LAWYER',
    firmRole: FirmRole.LAWYER,
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.case.count.mockResolvedValue(0);
    mockPrisma.calendarEvent.count.mockResolvedValue(0);
    mockPrisma.task.count.mockResolvedValue(0);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.expense.count.mockResolvedValue(0);
    mockPrisma.case.findMany.mockResolvedValue([]);
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.timeEntry.findMany.mockResolvedValue([]);
    mockCaseAccess.getCaseFilterForUser.mockReturnValue({ firmId: 'firm-1' });
    mockCaseAccess.getTaskFilterForUser.mockReturnValue({ assigneeId: 'user-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: BillingService, useValue: mockBilling },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  it('counts and lists "awaiting approval" by the same definition: status PENDING', async () => {
    const owner = { ...user, firmRole: FirmRole.OWNER } as any;
    mockPrisma.expense.count.mockImplementation(async ({ where }: any) =>
      where.status === 'PENDING' ? 1 : where.status === 'APPROVED' ? 1 : 0,
    );

    const result = await service.getStats(owner);

    expect(result.stats.pendingExpenses).toBe(1);
    expect(result.stats.approvedExpenses).toBe(1);
    expect(mockPrisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });

  it('merges the role-based task filter into the overdueTasks and myTasks counts', async () => {
    await service.getStats(user);

    expect(mockPrisma.task.count).toHaveBeenCalledWith({
      where: {
        case: { firmId: 'firm-1' },
        status: { not: 'DONE' },
        dueDate: { lt: expect.any(Date) },
        assigneeId: 'user-1',
      },
    });
    expect(mockPrisma.task.count).toHaveBeenCalledWith({
      where: {
        case: { firmId: 'firm-1' },
        status: { not: 'DONE' },
        assigneeId: 'user-1',
      },
    });
  });

  it('lists only the work the caller is personally carrying, standalone todos included', async () => {
    await service.getStats(user);

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assigneeId: 'user-1',
          status: { in: ['IN_PROGRESS', 'PENDING_REVIEW', 'NEEDS_REVISION'] },
          OR: [{ caseId: null }, { case: { firmId: 'firm-1' } }],
        },
      }),
    );
  });

  it('reports a task as on hold only while the hold is still open', async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      {
        id: 'task-waiting',
        title: 'Waiting on the court',
        status: 'IN_PROGRESS',
        dueDate: null,
        caseId: 'case-1',
        case: { id: 'case-1', ownRef: 'A-1', title: 'Case one' },
        onHold: { reason: 'Waiting for the clerk', nextFollowUpAt: null, endedAt: null },
      },
      {
        id: 'task-resumed',
        title: 'Back in motion',
        status: 'IN_PROGRESS',
        dueDate: null,
        caseId: null,
        case: null,
        onHold: { reason: 'Was waiting', nextFollowUpAt: null, endedAt: new Date() },
      },
    ]);

    const result = await service.getStats(user);

    expect(result.activeTasks).toEqual([
      {
        id: 'task-waiting',
        title: 'Waiting on the court',
        status: 'IN_PROGRESS',
        dueDate: null,
        caseId: 'case-1',
        caseRef: 'A-1',
        caseTitle: 'Case one',
        onHold: { reason: 'Waiting for the clerk', nextFollowUpAt: null },
      },
      {
        id: 'task-resumed',
        title: 'Back in motion',
        status: 'IN_PROGRESS',
        dueDate: null,
        caseId: null,
        caseRef: null,
        caseTitle: null,
        onHold: null,
      },
    ]);
  });
});
