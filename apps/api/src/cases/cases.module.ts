import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CaseActivitiesService } from './case-activities.service';
import { CaseActivitiesController } from './case-activities.controller';
import { CaseParticipantsService } from './case-participants.service';
import { CaseParticipantsController } from './case-participants.controller';
import { ContactCaseAccessService } from './contact-case-access.service';
import { ContactCaseAccessController } from './contact-case-access.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  imports: [CalendarModule],
  controllers: [
    CasesController,
    CaseActivitiesController,
    CaseParticipantsController,
    ContactCaseAccessController,
  ],
  providers: [
    CasesService,
    CaseActivitiesService,
    CaseParticipantsService,
    ContactCaseAccessService,
    FirmRoleGuard,
  ],
  exports: [CasesService],
})
export class CasesModule {}
