import { Module } from '@nestjs/common';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';

@Module({
  providers: [LegalService, IappLegalClient],
  controllers: [LegalController],
})
export class LegalModule {}
