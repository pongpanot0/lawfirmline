import { Module } from '@nestjs/common';
import { InsuranceClaimsService } from './insurance-claims.service';
import { InsuranceClaimsController } from './insurance-claims.controller';
import { LimitationDeadlineService } from './limitation-deadline.service';
import { CalendarModule } from '../calendar/calendar.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [CalendarModule, TasksModule],
  controllers: [InsuranceClaimsController],
  providers: [InsuranceClaimsService, LimitationDeadlineService],
  exports: [InsuranceClaimsService],
})
export class InsuranceClaimsModule {}
