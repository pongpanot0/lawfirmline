import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { TasksModule } from '../tasks/tasks.module';
import { DailyOperationsService } from './daily-operations.service';
import { DailyOperationsController, TeamWorkloadController } from './daily-operations.controller';

@Module({
  imports: [TasksModule, forwardRef(() => NotificationsModule)],
  controllers: [OperationsController, DailyOperationsController, TeamWorkloadController],
  providers: [OperationsService, DailyOperationsService, FirmRoleGuard],
})
export class OperationsModule {}
