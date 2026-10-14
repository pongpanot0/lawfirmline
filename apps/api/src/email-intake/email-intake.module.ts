import { Module } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { EmailIntakeController } from './email-intake.controller';
import { CaseEmailService } from './case-email.service';
import { CaseEmailController } from './case-email.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [EmailIntakeController, CaseEmailController],
  providers: [EmailIntakeService, CaseEmailService],
  exports: [EmailIntakeService],
})
export class EmailIntakeModule {}
