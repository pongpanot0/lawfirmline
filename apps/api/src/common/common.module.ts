import { Global, Module } from '@nestjs/common';
import { CaseAccessService } from './services/case-access.service';
import { AutomationLogService } from './services/automation-log.service';
import { CaseAccessGuard } from './guards/case-access.guard';
import { FileStorageService } from './services/file-storage.service';

@Global()
@Module({
  providers: [CaseAccessService, CaseAccessGuard, FileStorageService, AutomationLogService],
  exports: [CaseAccessService, CaseAccessGuard, FileStorageService, AutomationLogService],
})
export class CommonModule {}
