import { Module } from '@nestjs/common';
import { ReminderScheduler } from './reminder.scheduler';
import { LineMessagingService } from './line-messaging.service';
import { LineController } from './line.controller';

@Module({
  controllers: [LineController],
  providers: [ReminderScheduler, LineMessagingService],
  exports: [LineMessagingService],
})
export class NotificationsModule {}
