import { forwardRef, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TodosController } from './todos.controller';
import { TaskDetailController } from './task-detail.controller';
import { TaskDetailService } from './task-detail.service';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [TasksController, TodosController, TaskDetailController],
  providers: [TasksService, TaskDetailService],
  exports: [TasksService],
})
export class TasksModule {}
