import { forwardRef, Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { DocumentsModule } from '../documents/documents.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { ChunkingService } from './chunking.service';
import { RelevanceService } from './relevance.service';
import { EmbeddingService } from './embedding.service';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { AiUsageService } from './ai-usage.service';
import { AiUsageController } from './ai-usage.controller';
import { PleadingDraftService } from './pleading-draft.service';
import { PleadingDraftController } from './pleading-draft.controller';

@Module({
  imports: [forwardRef(() => IntelligenceModule), forwardRef(() => DocumentsModule)],
  providers: [ChunkingService, EmbeddingService, RelevanceService, RagService, AiUsageService, PleadingDraftService, AiCreditsInterceptor],
  controllers: [RagController, AiUsageController, PleadingDraftController],
  exports: [RagService, RelevanceService],
})
export class RagModule {}
