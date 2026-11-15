import { DocumentTemplatesModule } from '../document-templates/document-templates.module';
import { ReceiptsService } from './receipts.service';
import { FirmLinkService } from '../notifications/firm-link.service';
import { forwardRef, Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PettyCashService } from './petty-cash.service';
import { CashAdvanceService } from './cash-advance.service';
import { CollectionsService } from './collections.service';
import { TimeSuggestionsService } from './time-suggestions.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DocumentTemplatesModule, forwardRef(() => NotificationsModule)],
  controllers: [BillingController],
  providers: [
    ReceiptsService, FirmLinkService,BillingService, PettyCashService, CashAdvanceService, CollectionsService, TimeSuggestionsService],
  exports: [BillingService, CashAdvanceService, CollectionsService, TimeSuggestionsService],
})
export class BillingModule {}
