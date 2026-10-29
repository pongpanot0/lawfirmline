import { forwardRef, Module } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { EmailIntakeController } from './email-intake.controller';
import { CaseEmailService } from './case-email.service';
import { CaseEmailController } from './case-email.controller';
import { EmailDateSuggestionsService } from './email-date-suggestions.service';
import { DocumentsModule } from '../documents/documents.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';

@Module({
  imports: [forwardRef(() => DocumentsModule), forwardRef(() => IntelligenceModule)],
  controllers: [EmailIntakeController, CaseEmailController],
  providers: [EmailIntakeService, CaseEmailService, EmailDateSuggestionsService],
  exports: [EmailIntakeService, CaseEmailService],
})
export class EmailIntakeModule {}
