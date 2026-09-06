import { Test, TestingModule } from '@nestjs/testing';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { IntakePrecedentAnalysisService } from '../intake/intake-precedent-analysis.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

describe('CasesController precedent analysis', () => {
  let controller: CasesController;
  const mockCasesService = {};
  const mockAnalysisService = { listForCase: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CasesController],
      providers: [
        { provide: CasesService, useValue: mockCasesService },
        { provide: IntakePrecedentAnalysisService, useValue: mockAnalysisService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(FirmRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CasesController);
  });

  it('delegates case precedent-analysis listing to the service', async () => {
    mockAnalysisService.listForCase.mockResolvedValue([{ id: 'analysis-1' }]);

    const result = await controller.listPrecedentAnalyses(user, 'case-1');

    expect(mockAnalysisService.listForCase).toHaveBeenCalledWith(user, 'case-1');
    expect(result).toEqual([{ id: 'analysis-1' }]);
  });
});
