import { Module } from '@nestjs/common';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { DateSuggestionsService } from './date-suggestions.service';
import { IntelligenceController } from './intelligence.controller';
import { DateSuggestionsController } from './date-suggestions.controller';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { CalendarModule } from '../calendar/calendar.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [CalendarModule, DocumentsModule],
  providers: [DocumentIntelligenceService, DateSuggestionsService, AiCreditsInterceptor],
  controllers: [IntelligenceController, DateSuggestionsController],
  exports: [DocumentIntelligenceService, DateSuggestionsService],
})
export class IntelligenceModule {}
