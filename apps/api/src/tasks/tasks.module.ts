import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TodosController } from './todos.controller';

@Module({
  controllers: [TasksController, TodosController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
