import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeadlinesModule } from '../deadlines/deadlines.module';
import { TasksModule } from '../tasks/tasks.module';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController, CaseWorkflowsController } from './workflows.controller';
import { ExternalController } from './external.controller';

@Module({
  imports: [forwardRef(() => NotificationsModule), DeadlinesModule, forwardRef(() => TasksModule)],
  controllers: [WorkflowsController, CaseWorkflowsController, ExternalController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
