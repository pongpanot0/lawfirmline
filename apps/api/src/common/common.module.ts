import { Global, Module } from '@nestjs/common';
import { CaseAccessService } from './services/case-access.service';
import { CaseAccessGuard } from './guards/case-access.guard';

@Global()
@Module({
  providers: [CaseAccessService, CaseAccessGuard],
  exports: [CaseAccessService, CaseAccessGuard],
})
export class CommonModule {}
