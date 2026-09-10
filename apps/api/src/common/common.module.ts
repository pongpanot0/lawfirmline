import { Global, Module } from '@nestjs/common';
import { CaseAccessService } from './services/case-access.service';
import { CaseAccessGuard } from './guards/case-access.guard';
import { FileStorageService } from './services/file-storage.service';

@Global()
@Module({
  providers: [CaseAccessService, CaseAccessGuard, FileStorageService],
  exports: [CaseAccessService, CaseAccessGuard, FileStorageService],
})
export class CommonModule {}
