import { Test, TestingModule } from '@nestjs/testing';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CaseFeedService } from '../common/services/case-feed.service';

describe('CasesService assignment notifications', () => {
  let service: CasesService;
  const mockPrisma = {
    case: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    caseType: { findFirst: jest.fn() },
    client: { findFirst: jest.fn() },
    firmMember: { count: jest.fn() },
    caseAssignment: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    caseStatusLog: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const mockNotifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
  const mockCaseFeed = { log: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: 'OWNER' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.firmMember.count.mockResolvedValue(2);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseFeedService, useValue: mockCaseFeed },
        {
          provide: CaseAccessService,
          useValue: {
            getCaseFilterForUser: jest.fn().mockResolvedValue({}),
            canAccessCase: jest.fn().mockResolvedValue(true),
            getTaskFilterForUser: jest.fn().mockReturnValue({}),
          },
        },
        { provide: CaseActivitiesService, useValue: { record: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  it('notifies lead and buddies on create', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);
    mockPrisma.case.create.mockResolvedValue({
      id: 'c1', title: 'คดีทดสอบ', ownRef: 'TSBREF20260001', blackCaseNumber: 'ผบ.123/2569', redCaseNumber: 'ผบ.456/2569',
    });
    await service.create(user, {
      title: 'คดีทดสอบ',
      ownRef: 'A-001',
      leadLawyerId: 'u2',
      buddyIds: ['u3'],
    } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['u2'],
      actorUserId: 'user-1',
      summaryText: '⚖️ คุณได้รับมอบหมายเป็นทนายเจ้าของคดี\nคดี: คดีทดสอบ\nหมายเลขคดีดำ ผบ.123/2569 · หมายเลขคดีแดง ผบ.456/2569',
      entityPath: '/cases/c1',
    });
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['u3'],
      actorUserId: 'user-1',
      summaryText: '⚖️ คุณได้รับมอบหมายเข้าทีมคดี\nคดี: คดีทดสอบ\nหมายเลขคดีดำ ผบ.123/2569 · หมายเลขคดีแดง ผบ.456/2569',
      entityPath: '/cases/c1',
    });
  });

  it('records who opened the case', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);
    mockPrisma.firmMember.count.mockResolvedValue(1);
    mockPrisma.case.create.mockResolvedValue({ id: 'c1', title: 'คดีทดสอบ', openedAt: new Date('2026-09-22') });

    await service.create(user, {
      title: 'คดีทดสอบ',
      ownRef: 'A-001',
      leadLawyerId: 'u2',
    } as any);

    expect(mockCaseFeed.log).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'c1', userId: 'user-1', title: 'เปิดคดี',
    }));
  });

  it('notifies the new lead when leadLawyerId changes', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', title: 'คดีเดิม', leadLawyerId: 'u2' });
    mockPrisma.firmMember.count.mockResolvedValue(1);
    mockPrisma.case.update.mockResolvedValue({ id: 'c1', title: 'คดีเดิม', leadLawyerId: 'u4' });
    await service.update(user, 'c1', { leadLawyerId: 'u4' } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['u4'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('ทนายเจ้าของคดี'),
      entityPath: '/cases/c1',
    });
  });

  it('does not notify when the lead is unchanged', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', title: 'คดีเดิม', leadLawyerId: 'u4' });
    mockPrisma.firmMember.count.mockResolvedValue(1);
    mockPrisma.case.update.mockResolvedValue({ id: 'c1', leadLawyerId: 'u4' });
    await service.update(user, 'c1', { leadLawyerId: 'u4' } as any);
    expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('notifies only newly added buddies on updateAssignments', async () => {
    mockPrisma.case.findFirst.mockResolvedValue({ id: 'c1', title: 'คดีเดิม', leadLawyerId: 'u1' });
    mockPrisma.caseAssignment.findMany.mockResolvedValue([{ userId: 'u3' }]);
    mockPrisma.firmMember.count.mockResolvedValue(2);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'c1', title: 'คดีเดิม' });
    await service.updateAssignments(user, 'c1', { buddyIds: ['u3', 'u5'] } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledTimes(1);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['u5'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('เข้าทีมคดี'),
      entityPath: '/cases/c1',
    });
  });
});
