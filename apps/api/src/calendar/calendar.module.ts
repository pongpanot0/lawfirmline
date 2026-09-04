import { forwardRef, Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { TravelModule } from '../travel/travel.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TravelModule, forwardRef(() => NotificationsModule)],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
