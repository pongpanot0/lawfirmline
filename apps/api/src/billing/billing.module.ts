import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PettyCashService } from './petty-cash.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [BillingController],
  providers: [BillingService, PettyCashService],
  exports: [BillingService],
})
export class BillingModule {}
