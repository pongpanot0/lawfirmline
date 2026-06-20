import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PettyCashService } from './petty-cash.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PettyCashService],
  exports: [BillingService],
})
export class BillingModule {}
