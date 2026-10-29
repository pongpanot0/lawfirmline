import { GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { AI_CREDIT_COST } from '@lawfirm/shared';
import { CaseEmailController } from './case-email.controller';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { REQUIRE_CREDITS_KEY } from '../common/decorators/require-credits.decorator';

describe('CaseEmailController date-suggestions route', () => {
  const handler = CaseEmailController.prototype.suggestDatesFromMessage;

  it('charges AI credits the same way the document date extraction does', () => {
    expect(Reflect.getMetadata(REQUIRE_CREDITS_KEY, handler)).toBe(AI_CREDIT_COST.DOCUMENT_ANALYSIS);
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toContain(AiCreditsInterceptor);
  });

  it('is behind the case access guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(CaseAccessGuard);
  });
});
