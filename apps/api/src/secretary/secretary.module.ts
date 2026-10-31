import { forwardRef, Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { SecretaryToolsService } from './secretary-tools.service';
import { MatterBriefService } from './matter-brief.service';
import { SecretaryController } from './secretary.controller';

// PrismaModule and CommonModule (CaseAccessService/Guard) are @Global.
@Module({
  imports: [forwardRef(() => RagModule)],
  controllers: [SecretaryController],
  providers: [MatterBriefService, SecretaryToolsService],
  exports: [MatterBriefService, SecretaryToolsService],
})
export class SecretaryModule {}
