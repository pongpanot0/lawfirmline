import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TodosController } from './todos.controller';
import { IntakeTasksController } from './intake-tasks.controller';
import { TaskDetailController } from './task-detail.controller';
import { TaskDetailService } from './task-detail.service';
import { AiCreditsInterceptor } from '../common/interceptors/ai-credits.interceptor';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [TasksController, TodosController, IntakeTasksController, TaskDetailController],
  providers: [TasksService, TaskDetailService, AiCreditsInterceptor],
  exports: [TasksService],
})
export class TasksModule {}
