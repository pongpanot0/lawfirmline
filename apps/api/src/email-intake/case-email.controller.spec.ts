import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CaseEmailController } from './case-email.controller';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

describe('CaseEmailController date-suggestions route', () => {
  const handler = CaseEmailController.prototype.suggestDatesFromMessage;

  it('is behind the case access guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(CaseAccessGuard);
  });
});
