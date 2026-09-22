import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CasesService } from './cases.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseActivitiesService } from './case-activities.service';
import { CaseFeedService } from '../common/services/case-feed.service';

const owner = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;

describe('CasesService.remove — soft delete', () => {
  let service: CasesService;
  const mockPrisma = {
    case: { update: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: { canAccessCase: jest.fn() } },
        { provide: CaseActivitiesService, useValue: {} },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 'c1', ownRef: 'TSB0001', title: 'คดีทดสอบ' } as never);
  });

  // The whole point: cascade across 20 tables must never fire from this route.
  it('never hard-deletes the row', async () => {
    await service.remove(owner, 'c1');

    expect(mockPrisma.case.delete).not.toHaveBeenCalled();
    expect(mockPrisma.case.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('leaves an audit trail naming the case', async () => {
    await service.remove(owner, 'c1');

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firmId: 'f1',
        userId: 'u1',
        action: 'CASE_DELETED',
        metadata: expect.objectContaining({ caseId: 'c1', ownRef: 'TSB0001' }),
      }),
    });
  });

  it('refuses non-owners before touching anything', async () => {
    const lawyer = { ...owner, firmRole: FirmRole.LAWYER } as AuthUser;

    await expect(service.remove(lawyer, 'c1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CaseAccessService — deleted cases are invisible', () => {
  const access = new CaseAccessService({} as never);

  it.each([FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.LAWYER])(
    'filters deletedAt for %s',
    (firmRole) => {
      expect(access.getCaseFilterForUser({ ...owner, firmRole } as AuthUser)).toMatchObject({
        deletedAt: null,
      });
      expect(access.getCaseFilterForFinancials({ ...owner, firmRole } as AuthUser)).toMatchObject({
        deletedAt: null,
      });
    },
  );
});
