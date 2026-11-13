import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RagModule } from '../rag/rag.module';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';
import { StandupController } from './standup.controller';
import { StandupService } from './standup.service';
import { StandupScheduler } from './standup.scheduler';
import { CoachingNotifierService } from './coaching-notifier.service';

@Module({
  imports: [NotificationsModule, RagModule],
  controllers: [CoachingController, StandupController],
  providers: [CoachingService, StandupService, StandupScheduler, CoachingNotifierService],
  exports: [CoachingService, StandupService],
})
export class CoachingModule {}
