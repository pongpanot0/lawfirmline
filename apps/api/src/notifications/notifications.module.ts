import { Module } from '@nestjs/common';
import { ReminderScheduler } from './reminder.scheduler';
import { LineMessagingService } from './line-messaging.service';
import { LineLinkService } from './line-link.service';
import { EmailService } from './email.service';
import { LineController } from './line.controller';

@Module({
  controllers: [LineController],
  providers: [ReminderScheduler, LineMessagingService, LineLinkService, EmailService],
  exports: [LineMessagingService, LineLinkService, EmailService],
})
export class NotificationsModule {}
