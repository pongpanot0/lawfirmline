import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CaseActivitiesService } from './case-activities.service';
import { CaseActivitiesController } from './case-activities.controller';
import { CalendarModule } from '../calendar/calendar.module';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';

@Module({
  imports: [CalendarModule],
  controllers: [CasesController, CaseActivitiesController],
  providers: [CasesService, CaseActivitiesService, FirmRoleGuard],
  exports: [CasesService],
})
export class CasesModule {}
