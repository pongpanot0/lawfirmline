import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksModule } from '../tasks/tasks.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { IntakeService } from './intake.service';
import { IntakeController } from './intake.controller';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { DocumentsModule } from '../documents/documents.module';
import { ConflictCheckModule } from '../conflict-check/conflict-check.module';
import { RagModule } from '../rag/rag.module';
import { CargoClaimsModule } from '../cargo-claims/cargo-claims.module';

@Module({
  imports: [forwardRef(() => TasksModule), forwardRef(() => IntelligenceModule), forwardRef(() => DocumentsModule), ConflictCheckModule, forwardRef(() => RagModule), forwardRef(() => CargoClaimsModule), forwardRef(() => NotificationsModule)],
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
