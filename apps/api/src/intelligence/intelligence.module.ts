import { forwardRef, Module } from '@nestjs/common';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DateSuggestionsService } from './date-suggestions.service';
import { ReceiptExtractionService } from './receipt-extraction.service';
import { IntelligenceController } from './intelligence.controller';
import { DateSuggestionsController } from './date-suggestions.controller';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { CalendarModule } from '../calendar/calendar.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [forwardRef(() => CalendarModule), forwardRef(() => DocumentsModule)],
  providers: [DocumentIntelligenceService, DateSuggestionsService, ReceiptExtractionService, AiCreditsInterceptor],
  controllers: [IntelligenceController, DateSuggestionsController],
  exports: [DocumentIntelligenceService, DateSuggestionsService, ReceiptExtractionService],
})
export class IntelligenceModule {}
