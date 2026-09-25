import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LeaveType } from '../generated/prisma';
import { LeaveService } from './leave.service';

@Controller('leaves')
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(private leaves: LeaveService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('from') from: string, @Query('to') to: string) {
    return this.leaves.list(user, from, to);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: { type: LeaveType; startDate: string; endDate: string }) {
    return this.leaves.create(user, body);
  }

  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leaves.cancel(user, id);
  }
}
