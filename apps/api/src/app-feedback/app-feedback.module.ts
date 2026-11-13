import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppFeedbackController, PlatformFeedbackController } from './app-feedback.controller';
import { AppFeedbackService } from './app-feedback.service';

// The LINE router consumes this service without changing NotificationsModule's imports.
@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [AppFeedbackController, PlatformFeedbackController],
  providers: [AppFeedbackService],
  exports: [AppFeedbackService],
})
export class AppFeedbackModule {}
