import { EventResponsibilityController } from './event-responsibility.controller';
import { EventResponsibilityService } from './event-responsibility.service';
import { forwardRef, Module } from '@nestjs/common';
import { CourtDayService } from './court-day.service';
import { CourtDayController } from './court-day.controller';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { TravelModule } from '../travel/travel.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';

@Module({
  imports: [TravelModule, forwardRef(() => NotificationsModule), DeadlinesModule],
  controllers: [CalendarController, CourtDayController, EventResponsibilityController],
  providers: [CalendarService, CourtDayService, EventResponsibilityService],
  exports: [CalendarService],
})
export class CalendarModule {}
