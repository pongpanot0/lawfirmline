import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [TasksModule, IntelligenceModule, DocumentsModule],
  controllers: [IntakeController],
  providers: [
    IntakeService,
    AiCreditsInterceptor,
    IntakePrecedentAnalysisService,
    IappLegalClient,
  ],
  exports: [IntakeService, IntakePrecedentAnalysisService],
})
export class IntakeModule {}
