import { Test, TestingModule } from '@nestjs/testing';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';

describe('IntakeController precedent analysis', () => {
  let controller: IntakeController;
  const mockIntakeService = {};
  const mockAnalysisService = {
    analyze: jest.fn(),
    listForIntake: jest.fn(),
    getOne: jest.fn(),
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntakeController],
      providers: [
        { provide: IntakeService, useValue: mockIntakeService },
        { provide: IntakePrecedentAnalysisService, useValue: mockAnalysisService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      // AiCreditsInterceptor is referenced by class in @UseInterceptors on the
      // runPrecedentAnalysis route, so Nest resolves its constructor deps
      // (Reflector, PrismaService) eagerly at module-compile time. Override it
      // the same way the guards above are overridden.
      .overrideInterceptor(AiCreditsInterceptor)
      .useValue({ intercept: (_: unknown, next: any) => next.handle() })
      .compile();
    controller = module.get(IntakeController);
  });

  it('delegates precedent-analysis creation to the service', async () => {
    mockAnalysisService.analyze.mockResolvedValue({ id: 'analysis-1', status: 'COMPLETE' });
    const result = await controller.runPrecedentAnalysis(user, 'intake-1', { attachmentIds: [] });
    expect(mockAnalysisService.analyze).toHaveBeenCalledWith(user, 'intake-1', []);
    expect(result).toEqual({ id: 'analysis-1', status: 'COMPLETE' });
  });

  it('delegates listing to the service', async () => {
    mockAnalysisService.listForIntake.mockResolvedValue([{ id: 'analysis-1' }]);
    const result = await controller.listPrecedentAnalyses(user, 'intake-1');
    expect(mockAnalysisService.listForIntake).toHaveBeenCalledWith(user, 'intake-1');
    expect(result).toEqual([{ id: 'analysis-1' }]);
  });

  it('delegates single-record fetch to the service', async () => {
    mockAnalysisService.getOne.mockResolvedValue({ id: 'analysis-1' });
    const result = await controller.getPrecedentAnalysis(user, 'intake-1', 'analysis-1');
    expect(mockAnalysisService.getOne).toHaveBeenCalledWith(user, 'intake-1', 'analysis-1');
    expect(result).toEqual({ id: 'analysis-1' });
  });
});
