import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DateSuggestionStatus } from '@lawfirm/shared';
import { DateSuggestionsController } from './date-suggestions.controller';
import { DateSuggestionsService } from './date-suggestions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { REQUIRE_CREDITS_KEY } from '../common/decorators/require-credits.decorator';

describe('DateSuggestionsController', () => {
  let controller: DateSuggestionsController;
  let reflector: Reflector;
  const mockService = { listForCase: jest.fn(), confirm: jest.fn(), dismiss: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DateSuggestionsController],
      providers: [{ provide: DateSuggestionsService, useValue: mockService }, Reflector],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DateSuggestionsController);
    reflector = module.get(Reflector);
  });

  it('confirm and dismiss do not cost AI credits', () => {
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.confirm)).toBeUndefined();
    expect(reflector.get(REQUIRE_CREDITS_KEY, controller.dismiss)).toBeUndefined();
  });

  it('list delegates to the service with the given case and status', async () => {
    mockService.listForCase.mockResolvedValue([]);
    await controller.list('case-1', DateSuggestionStatus.PENDING);
    expect(mockService.listForCase).toHaveBeenCalledWith('case-1', DateSuggestionStatus.PENDING);
  });

  it('confirm delegates to the service with the current user id and body', async () => {
    mockService.confirm.mockResolvedValue({});
    await controller.confirm({ id: 'user-1' } as never, 'case-1', 'sug-1', { label: 'x' });
    expect(mockService.confirm).toHaveBeenCalledWith('case-1', 'sug-1', 'user-1', { label: 'x' });
  });

  it('dismiss delegates to the service with the current user id', async () => {
    mockService.dismiss.mockResolvedValue({});
    await controller.dismiss({ id: 'user-1' } as never, 'case-1', 'sug-1');
    expect(mockService.dismiss).toHaveBeenCalledWith('case-1', 'sug-1', 'user-1');
  });
});
