import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { TasksModule } from '../tasks/tasks.module';
import { DailyOperationsService } from './daily-operations.service';
import { DailyOperationsController } from './daily-operations.controller';

@Module({
  imports: [TasksModule],
  controllers: [OperationsController, DailyOperationsController],
  providers: [OperationsService, DailyOperationsService, FirmRoleGuard],
})
export class OperationsModule {}
