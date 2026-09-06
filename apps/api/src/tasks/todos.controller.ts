import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

@Controller('todos')
@UseGuards(JwtAuthGuard)
export class TodosController {
  constructor(private tasksService: TasksService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.tasksService.findMine(user);
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user, null, { ...dto, assigneeId: dto.assigneeId ?? user.id });
  }

  @Patch(':taskId')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    await this.tasksService.assertStandaloneOwnership(taskId, user);
    return this.tasksService.update(taskId, dto, user);
  }

  @Delete(':taskId')
  async remove(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    await this.tasksService.assertStandaloneOwnership(taskId, user);
    return this.tasksService.remove(taskId);
  }
}
