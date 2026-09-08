import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { InsuranceClaimStage } from '@lawfirm/shared';
import { InsuranceClaimsService } from './insurance-claims.service';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { LimitationDeadlineService } from './limitation-deadline.service';

/**
 * Advancing a claim's stage opens the tasks that stage calls for. Pressing the
 * button twice, or retrying after a response is lost, must not put the same
 * task on the case a second time — a duplicated filing deadline is worse than
 * none, because it is believed.
 */
describe('InsuranceClaimsService.advanceStage — repeated advance', () => {
  let service: InsuranceClaimsService;
  const mockPrisma = {
    insuranceClaim: { findUnique: jest.fn(), update: jest.fn() },
    caseActivity: { create: jest.fn() },
    case: { findUnique: jest.fn() },
  };
  const mockTasks = { create: jest.fn() };
  const mockLimitation = { applyIncidentDate: jest.fn(), computeDeadline: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsuranceClaimsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasks },
        { provide: LimitationDeadlineService, useValue: mockLimitation },
      ],
    }).compile();
    service = module.get(InsuranceClaimsService);
  });

  it('opens the stage tasks once, then refuses to move to the stage it is already at', async () => {
    mockPrisma.insuranceClaim.findUnique.mockResolvedValue({
      caseId: 'case-1',
      stage: InsuranceClaimStage.CLAIM_FILED,
    });
    mockPrisma.insuranceClaim.update.mockResolvedValue({
      caseId: 'case-1',
      stage: InsuranceClaimStage.DEMAND_SENT,
    });

    await service.advanceStage(user, 'case-1', { stage: InsuranceClaimStage.DEMAND_SENT });
    expect(mockTasks.create).toHaveBeenCalledTimes(1);

    // The retry sees a claim already at that stage.
    mockPrisma.insuranceClaim.findUnique.mockResolvedValue({
      caseId: 'case-1',
      stage: InsuranceClaimStage.DEMAND_SENT,
    });

    await expect(
      service.advanceStage(user, 'case-1', { stage: InsuranceClaimStage.DEMAND_SENT }),
    ).rejects.toThrow(BadRequestException);
    expect(mockTasks.create).toHaveBeenCalledTimes(1);
  });
});
