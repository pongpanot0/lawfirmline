import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

/**
 * งาน/checklist ของเรื่องรับเข้า — intake เป็นงานจริงตั้งแต่ยังไม่เป็นคดี
 * เปิดคดีแล้วงานพวกนี้ถูกย้ายไปเป็นงานคดีโดยอัตโนมัติ
 */
@Controller('intake/:intakeId/tasks')
@UseGuards(JwtAuthGuard)
export class IntakeTasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  findByIntake(@CurrentUser() user: AuthUser, @Param('intakeId') intakeId: string) {
    return this.tasksService.findByIntake(intakeId, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createForIntake(user, intakeId, dto);
  }

  @Patch(':taskId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateForIntake(user, intakeId, taskId, dto);
  }

  @Delete(':taskId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('intakeId') intakeId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.removeForIntake(user, intakeId, taskId);
  }
}
