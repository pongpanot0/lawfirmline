import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';

@Module({
  imports: [IntelligenceModule],
  providers: [ChunkingService, EmbeddingService, RagService, AiCreditsInterceptor],
  controllers: [RagController],
  exports: [RagService],
})
export class RagModule {}
