import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { RequireCapability } from '../saas/decorators/saas.decorators';
import { CoachingService } from './coaching.service';
import { AcknowledgeCoachingDto, CoachingDraftDto, CoachingQueryDto, SaveCoachingDto } from './dto/coaching.dto';

@Controller('coaching')
@UseGuards(JwtAuthGuard, FirmRoleGuard)
export class CoachingController {
  constructor(private coaching: CoachingService) {}
  @Post('draft') @RequireCapability('runOperations')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  draft(@CurrentUser() user: AuthUser, @Body() dto: CoachingDraftDto) { return this.coaching.draft(user, dto.userId); }
  @Post() @RequireCapability('runOperations')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveCoachingDto) { return this.coaching.save(user, dto); }
  @Get() @RequireCapability('runOperations')
  list(@CurrentUser() user: AuthUser, @Query() query: CoachingQueryDto) { return this.coaching.list(user, query); }
  @Get('members/:userId') @RequireCapability('runOperations')
  member(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string) { return this.coaching.member(user, userId); }
  @Get('mine') mine(@CurrentUser() user: AuthUser) { return this.coaching.mine(user); }
  @Post(':id/acknowledge')
  acknowledge(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcknowledgeCoachingDto) { return this.coaching.acknowledge(user, id, dto.reply); }
}
