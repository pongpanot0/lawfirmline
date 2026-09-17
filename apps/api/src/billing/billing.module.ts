import { forwardRef, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PettyCashService } from './petty-cash.service';
import { CashAdvanceService } from './cash-advance.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [BillingController],
  providers: [BillingService, PettyCashService, CashAdvanceService],
  exports: [BillingService, CashAdvanceService],
})
export class BillingModule {}
