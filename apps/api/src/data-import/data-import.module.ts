import { Module } from '@nestjs/common';
import { CasesModule } from '../cases/cases.module';
import { CalendarModule } from '../calendar/calendar.module';
import { OutlookIntegrationModule } from '../outlook-integration/outlook-integration.module';
import { SaasModule } from '../saas/saas.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvitationService } from '../saas/invitation.service';
import { DataImportController } from './data-import.controller';
import { DataImportMemberGuard } from './data-import-member.guard';
import { DataImportService } from './data-import.service';

@Module({
  imports: [CasesModule, CalendarModule, OutlookIntegrationModule, SaasModule, NotificationsModule],
  controllers: [DataImportController],
  providers: [DataImportService, DataImportMemberGuard, InvitationService],
})
export class DataImportModule {}
