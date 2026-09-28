import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { OwnerOnly } from '../saas/decorators/saas.decorators';
import { DailyOperationsService } from './daily-operations.service';
import { AssignDailyTaskDto, CreateDailyTaskDto, DailyWorkQueryDto, MoveDailyTaskDto, WorkTypesDto } from './dto/daily-operations.dto';

@Controller('operations')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
@OwnerOnly()
export class DailyOperationsController {
  constructor(private daily: DailyOperationsService) {}
  @Get('daily') board(@CurrentUser() user: AuthUser, @Query() query: DailyWorkQueryDto) { return this.daily.board(user, query.date); }
  @Post('tasks') create(@CurrentUser() user: AuthUser, @Body() dto: CreateDailyTaskDto) { return this.daily.create(user, dto); }
  @Patch('tasks/:id/assign') assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignDailyTaskDto) { return this.daily.assign(user, id, dto); }
  @Patch('tasks/:id/order') move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveDailyTaskDto) { return this.daily.move(user, id, dto.direction); }
  @Patch('members/:id/work-types') types(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: WorkTypesDto) { return this.daily.workTypes(user, id, dto.workTypes); }
}
