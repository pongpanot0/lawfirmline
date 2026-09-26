import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { CasesService } from './cases.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseActivitiesService } from './case-activities.service';
import { CaseFeedService } from '../common/services/case-feed.service';

describe('CasesService.findOne', () => {
  let service: CasesService;
  const mockPrisma = { case: { findUnique: jest.fn() } };
  const realCaseAccess = new CaseAccessService({} as any);
  const mockCaseAccess = {
    canAccessCase: jest.fn(),
    getTaskFilterForUser: jest.fn((user) => realCaseAccess.getTaskFilterForUser(user)),
  };
  const mockActivities = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: CaseActivitiesService, useValue: mockActivities },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  it('includes the real role-based task filter (with unassigned-task branch) for a SENIOR_LAWYER', async () => {
    const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.SENIOR_LAWYER } as any;
    mockCaseAccess.canAccessCase.mockResolvedValue(true);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'case-1' });

    const expectedTaskFilter = realCaseAccess.getTaskFilterForUser(user);

    await service.findOne(user, 'case-1');

    expect(mockPrisma.case.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          tasks: expect.objectContaining({ where: expectedTaskFilter }),
        }),
      }),
    );
    expect(expectedTaskFilter).toEqual({
      AND: [
        {
          OR: [
            { case: { firmId: 'firm-1', deletedAt: null } },
            { caseId: null, createdBy: { firmMembers: { some: { firmId: 'firm-1' } } } },
          ],
        },
        {
          OR: [
            { assigneeId: 'user-1' },
            {
              assignee: {
                firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
              },
            },
            { assigneeId: null },
          ],
        },
      ],
    });
  });
});

describe('CasesService.createForPortal', () => {
  let service: CasesService;
  const tx = {
    firm: { findUnique: jest.fn() },
    case: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
        { provide: PrismaService, useValue: {} },
        { provide: CaseAccessService, useValue: {} },
        { provide: CaseActivitiesService, useValue: {} },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  it('numbers the case with the firm sequence inside the given transaction and opens it at PRE_LITIGATION', async () => {
    tx.firm.findUnique.mockResolvedValue({ ownRefPrefix: 'ABC' });
    tx.case.findMany.mockResolvedValue([{ ownRef: `ABC${new Date().getFullYear()}0007` }]);
    tx.case.findUnique.mockResolvedValue(null);
    tx.case.create.mockResolvedValue({ id: 'case-1' });

    await service.createForPortal(tx as any, {
      firmId: 'firm-1',
      clientId: 'client-1',
      clientName: 'บริษัท ก',
      title: 'ขอคำปรึกษา',
      description: 'รายละเอียด',
      leadLawyerId: 'owner-1',
    });

    expect(tx.case.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmId: 'firm-1',
          ownRef: expect.stringMatching(/^ABC\d{4}0008$/),
          folderId: expect.stringMatching(/^LF-/),
          stage: 'PRE_LITIGATION',
          clientId: 'client-1',
          clientName: 'บริษัท ก',
          title: 'ขอคำปรึกษา',
          description: 'รายละเอียด',
          leadLawyerId: 'owner-1',
        }),
      }),
    );
  });
});

describe('CasesService.create Own Ref allocation', () => {
  let service: CasesService;
  const mockPrisma = {
    firm: { findUnique: jest.fn() },
    firmMember: { count: jest.fn() },
    case: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.firmMember.count.mockResolvedValue(1);
    mockPrisma.firm.findUnique.mockResolvedValue({ ownRefPrefix: 'ABC' });
    mockPrisma.case.findMany.mockResolvedValue([]);
    mockPrisma.case.findUnique.mockResolvedValue({ id: 'taken' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: {} },
        { provide: CaseActivitiesService, useValue: {} },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  it('rejects a manual Own Ref that is already used', async () => {
    await expect(
      service.create(user, { title: 'ค', leadLawyerId: 'user-1', ownRef: 'ABC20260001' } as any),
    ).rejects.toThrow('Own ref already exists');
    expect(mockPrisma.case.create).not.toHaveBeenCalled();
  });

  it('gives up after five generated Own Refs collide', async () => {
    await expect(service.create(user, { title: 'ค', leadLawyerId: 'user-1' } as any)).rejects.toThrow(
      'Could not allocate a unique Own Ref — please retry',
    );
    expect(mockPrisma.case.findUnique).toHaveBeenCalledTimes(5);
    expect(mockPrisma.case.create).not.toHaveBeenCalled();
  });
});
