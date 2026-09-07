import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseActivitiesService } from './case-activities.service';

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
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: CaseActivitiesService, useValue: mockActivities },
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
      OR: [
        { assigneeId: 'user-1' },
        {
          assignee: {
            firmMembers: { some: { firmId: 'firm-1', role: FirmRole.LAWYER } },
          },
        },
        { assigneeId: null },
      ],
    });
  });
});
