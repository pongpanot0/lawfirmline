import { Global, Module } from '@nestjs/common';
import { CaseAccessService } from './services/case-access.service';
import { CaseFeedService } from './services/case-feed.service';
import { CaseAccessGuard } from './guards/case-access.guard';
import { FileStorageService } from './services/file-storage.service';

@Global()
@Module({
  providers: [CaseAccessService, CaseFeedService, CaseAccessGuard, FileStorageService],
  exports: [CaseAccessService, CaseFeedService, CaseAccessGuard, FileStorageService],
})
export class CommonModule {}
