import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { StandupService } from './standup.service';
import { StandupDto, StandupHistoryDto } from './dto/coaching.dto';

@Controller('standup')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
export class StandupController {
  constructor(private standup: StandupService) {}
  @Get('today') today(@CurrentUser() user: AuthUser) { return this.standup.today(user); }
  @Put('today') upsert(@CurrentUser() user: AuthUser, @Body() dto: StandupDto) { return this.standup.upsert(user, dto); }
  @Post('today/skip') skip(@CurrentUser() user: AuthUser) { return this.standup.skip(user); }
  @Get('members/:userId') @RequireCapability('runOperations')
  history(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Query() query: StandupHistoryDto) { return this.standup.history(user, userId, query.days); }
}
