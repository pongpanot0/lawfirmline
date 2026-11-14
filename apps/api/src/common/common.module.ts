import { Global, Module } from '@nestjs/common';
import { CaseAccessService } from './services/case-access.service';
import { CaseFeedService } from './services/case-feed.service';
import { AutomationLogService } from './services/automation-log.service';
import { CaseAccessGuard } from './guards/case-access.guard';
import { FileStorageService } from './services/file-storage.service';
import { PlanQuotaService } from './services/plan-quota.service';
import { AiQuotaInterceptor } from './decorators/ai-action.decorator';

@Global()
@Module({
  providers: [CaseAccessService, CaseFeedService, CaseAccessGuard, FileStorageService, AutomationLogService, PlanQuotaService, AiQuotaInterceptor],
  exports: [CaseAccessService, CaseFeedService, CaseAccessGuard, FileStorageService, AutomationLogService, PlanQuotaService, AiQuotaInterceptor],
})
export class CommonModule {}
