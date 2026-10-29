import { forwardRef, Module } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { EmailIntakeController } from './email-intake.controller';
import { CaseEmailService } from './case-email.service';
import { CaseEmailController } from './case-email.controller';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [forwardRef(() => DocumentsModule)],
  controllers: [EmailIntakeController, CaseEmailController],
  providers: [EmailIntakeService, CaseEmailService],
  exports: [EmailIntakeService, CaseEmailService],
})
export class EmailIntakeModule {}
