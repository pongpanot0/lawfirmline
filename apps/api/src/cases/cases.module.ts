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
import { CaseCommentsService } from './case-comments.service';
import { CalendarModule } from '../calendar/calendar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IntakeModule } from '../intake/intake.module';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { CargoClaimsModule } from '../cargo-claims/cargo-claims.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { ConflictCheckModule } from '../conflict-check/conflict-check.module';
import { CaseProceedingsService } from './case-proceedings.service';
import { CaseProceedingsController } from './case-proceedings.controller';

@Module({
  imports: [forwardRef(() => CalendarModule), forwardRef(() => NotificationsModule), forwardRef(() => IntakeModule), forwardRef(() => CargoClaimsModule), forwardRef(() => DeadlinesModule), ConflictCheckModule],
  controllers: [
    CasesController,
    CaseActivitiesController,
    CaseParticipantsController,
    ContactCaseAccessController,
    CaseMessageController,
    CaseProceedingsController,
  ],
  providers: [
    CasesService,
    CaseActivitiesService,
    CaseParticipantsService,
    ContactCaseAccessService,
    CaseMessageService,
    CaseMessageRateLimiterService,
    CaseCommentsService,
    CaseProceedingsService,
    FirmRoleGuard,
  ],
  exports: [CasesService, CaseMessageService],
})
export class CasesModule {}
