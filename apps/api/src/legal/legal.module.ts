import { Module } from '@nestjs/common';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';

@Module({
  providers: [LegalService, IappLegalClient, AiCreditsInterceptor],
  controllers: [LegalController],
})
export class LegalModule {}
