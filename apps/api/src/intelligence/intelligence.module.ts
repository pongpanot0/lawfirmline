import { Module } from '@nestjs/common';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { IntelligenceController } from './intelligence.controller';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';

@Module({
  providers: [DocumentIntelligenceService, AiCreditsInterceptor],
  controllers: [IntelligenceController],
  exports: [DocumentIntelligenceService],
})
export class IntelligenceModule {}
