import { forwardRef, Module } from '@nestjs/common';
import { DeadlineRulesService } from './deadline-rules.service';
import { CaseDeadlinesController, DeadlineRulesController } from './deadlines.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [DeadlineRulesController, CaseDeadlinesController],
  providers: [DeadlineRulesService],
  exports: [DeadlineRulesService],
})
export class DeadlinesModule {}
