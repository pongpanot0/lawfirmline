import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DeadlineTrigger, FirmRole, Role } from '@lawfirm/shared';
import { CaseDeadlinesController, DeadlineRulesController } from './deadlines.controller';
import { DeadlineRulesService } from './deadline-rules.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('deadline controllers', () => {
  let rules: DeadlineRulesController;
  let cases: CaseDeadlinesController;
  let reflector: Reflector;
  const mockService = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    applyTriggerForCase: jest.fn(),
  };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeadlineRulesController, CaseDeadlinesController],
      providers: [{ provide: DeadlineRulesService, useValue: mockService }, Reflector],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    rules = module.get(DeadlineRulesController);
    cases = module.get(CaseDeadlinesController);
    reflector = module.get(Reflector);
  });

  it('lets any member read the rules but only an admin change them', () => {
    expect(reflector.get(ROLES_KEY, rules.list)).toBeUndefined();
    for (const handler of [rules.create, rules.update, rules.remove]) {
      expect(reflector.get(ROLES_KEY, handler)).toEqual([Role.ADMIN]);
    }
  });

  it('scopes every rule call to the caller firm', () => {
    rules.list(user);
    rules.remove(user, 'rule-1');

    expect(mockService.list).toHaveBeenCalledWith(user);
    expect(mockService.remove).toHaveBeenCalledWith(user, 'rule-1');
  });

  it('applies a trigger against the case in the route, not one from the body', () => {
    cases.apply(user, 'case-1', {
      trigger: DeadlineTrigger.JUDGMENT,
      triggerDate: '2026-09-04T00:00:00Z',
    });

    expect(mockService.applyTriggerForCase).toHaveBeenCalledWith(user, 'case-1', {
      trigger: DeadlineTrigger.JUDGMENT,
      triggerDate: '2026-09-04T00:00:00Z',
    });
  });
});
