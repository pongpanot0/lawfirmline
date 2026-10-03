import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController, CaseWorkflowsController } from './workflows.controller';
import { ExternalController } from './external.controller';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [WorkflowsController, CaseWorkflowsController, ExternalController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
