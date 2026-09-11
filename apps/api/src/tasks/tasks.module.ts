import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TodosController } from './todos.controller';
import { TaskDetailController } from './task-detail.controller';
import { TaskDetailService } from './task-detail.service';

@Module({
  controllers: [TasksController, TodosController, TaskDetailController],
  providers: [TasksService, TaskDetailService],
  exports: [TasksService],
})
export class TasksModule {}
