import { forwardRef, Module } from '@nestjs/common';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PracticeSetupController } from './practice-setup.controller';
import { PracticeSetupService } from './practice-setup.service';
@Module({
  imports: [DeadlinesModule, forwardRef(() => NotificationsModule)],
  controllers: [PracticeSetupController],
  providers: [PracticeSetupService],
  exports: [PracticeSetupService],
})
export class PracticeSetupModule {}
