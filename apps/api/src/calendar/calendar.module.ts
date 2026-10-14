import { EventResponsibilityController } from './event-responsibility.controller';
import { EventResponsibilityService } from './event-responsibility.service';
import { forwardRef, Module } from '@nestjs/common';
import { CourtDayService } from './court-day.service';
import { CourtDayController } from './court-day.controller';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { OutlookChangesController } from './outlook-changes.controller';
import { OutlookChangesService } from './outlook-changes.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { TravelModule } from '../travel/travel.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { OutlookIntegrationModule } from '../outlook-integration/outlook-integration.module';

@Module({
  imports: [TravelModule, forwardRef(() => NotificationsModule), forwardRef(() => DeadlinesModule), forwardRef(() => OutlookIntegrationModule)],
  controllers: [CalendarController, AvailabilityController, OutlookChangesController, CourtDayController, EventResponsibilityController],
  providers: [CalendarService, AvailabilityService, OutlookChangesService, CourtDayService, EventResponsibilityService],
  exports: [CalendarService, EventResponsibilityService],
})
export class CalendarModule {}
