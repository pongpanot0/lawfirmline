import { forwardRef, Module } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { EmailIntakeController } from './email-intake.controller';
import { CaseEmailService } from './case-email.service';
import { CaseEmailController } from './case-email.controller';
import { EmailDateSuggestionsService } from './email-date-suggestions.service';
import { EmailMentionTasksService } from './email-mention-tasks.service';
import { TasksModule } from '../tasks/tasks.module';
import { DocumentsModule } from '../documents/documents.module';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { OutlookIntegrationModule } from '../outlook-integration/outlook-integration.module';

@Module({
  imports: [forwardRef(() => DocumentsModule), forwardRef(() => IntelligenceModule), forwardRef(() => OutlookIntegrationModule), forwardRef(() => TasksModule)],
  controllers: [EmailIntakeController, CaseEmailController],
  providers: [EmailIntakeService, CaseEmailService, EmailDateSuggestionsService, EmailMentionTasksService],
  exports: [EmailIntakeService, CaseEmailService],
})
export class EmailIntakeModule {}
