import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';

@Module({
  imports: [TasksModule],
  controllers: [IntakeController],
  providers: [
    IntakeService,
    AiCreditsInterceptor,
    IntakePrecedentAnalysisService,
    IappLegalClient,
    DocumentIntelligenceService,
  ],
  exports: [IntakeService],
})
export class IntakeModule {}
