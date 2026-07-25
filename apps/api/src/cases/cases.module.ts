import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { CaseActivitiesService } from './case-activities.service';
import { CaseActivitiesController } from './case-activities.controller';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [CalendarModule],
  controllers: [CasesController, CaseActivitiesController],
  providers: [CasesService, CaseActivitiesService],
  exports: [CasesService],
})
export class CasesModule {}
