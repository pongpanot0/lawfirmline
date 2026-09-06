import { forwardRef, Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CaseActivitiesService } from './case-activities.service';
import { CaseActivitiesController } from './case-activities.controller';
import { CaseParticipantsService } from './case-participants.service';
import { CaseParticipantsController } from './case-participants.controller';
import { ContactCaseAccessService } from './contact-case-access.service';
import { ContactCaseAccessController } from './contact-case-access.controller';
import { CaseMessageService } from './case-message.service';
import { CaseMessageRateLimiterService } from './case-message-rate-limiter.service';
import { CaseMessageController } from './case-message.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  imports: [CalendarModule, forwardRef(() => NotificationsModule)],
  controllers: [
    CasesController,
    CaseActivitiesController,
    CaseParticipantsController,
    ContactCaseAccessController,
    CaseMessageController,
  ],
  providers: [
    CasesService,
    CaseActivitiesService,
    CaseParticipantsService,
    ContactCaseAccessService,
    CaseMessageService,
    CaseMessageRateLimiterService,
    FirmRoleGuard,
  ],
  exports: [CasesService, CaseMessageService],
})
export class CasesModule {}
