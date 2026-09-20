import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { ChunkingService } from './chunking.service';
import { RelevanceService } from './relevance.service';
import { EmbeddingService } from './embedding.service';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { AiUsageService } from './ai-usage.service';
import { AiUsageController } from './ai-usage.controller';

@Module({
  imports: [IntelligenceModule],
  providers: [ChunkingService, EmbeddingService, RelevanceService, RagService, AiUsageService, AiCreditsInterceptor],
  controllers: [RagController, AiUsageController],
  exports: [RagService, RelevanceService],
})
export class RagModule {}
