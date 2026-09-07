import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { StartTaskOnHoldDto, UpdateTaskOnHoldDto } from './dto/task-on-hold.dto';
import { HandoffTaskDto, ReassignTaskDto, RejectTaskDto } from './dto/task-handoff.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '@lawfirm/shared';

@Controller('cases/:caseId/tasks')
@UseGuards(JwtAuthGuard, CaseAccessGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  @Get()
  findByCase(@CurrentUser() user: AuthUser, @Param('caseId') caseId: string) {
    return this.tasksService.findByCase(caseId, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(user, caseId, dto);
  }

  @Patch(':taskId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(taskId, dto, user);
  }

  @Patch(':taskId/handoff')
  handoff(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: HandoffTaskDto,
  ) {
    return this.tasksService.handoff(caseId, taskId, user, dto);
  }

  @Post(':taskId/accept')
  accept(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.accept(caseId, taskId, user);
  }

  @Post(':taskId/reject')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: RejectTaskDto,
  ) {
    return this.tasksService.reject(caseId, taskId, user, dto);
  }

  @Patch(':taskId/reassign')
  reassign(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: ReassignTaskDto,
  ) {
    return this.tasksService.reassign(caseId, taskId, user, dto);
  }

  @Patch(':taskId/hold')
  startOnHold(
    @CurrentUser() user: AuthUser,
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: StartTaskOnHoldDto,
  ) {
    return this.tasksService.startOnHold(caseId, taskId, user, dto);
  }

  @Patch(':taskId/hold/follow-up')
  updateOnHold(
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskOnHoldDto,
  ) {
    return this.tasksService.updateOnHold(caseId, taskId, dto);
  }

  @Post(':taskId/hold/resume')
  resumeFromOnHold(
    @Param('caseId') caseId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.resumeFromOnHold(caseId, taskId);
  }

  @Delete(':taskId')
  remove(@Param('taskId') taskId: string) {
    return this.tasksService.remove(taskId);
  }
}
