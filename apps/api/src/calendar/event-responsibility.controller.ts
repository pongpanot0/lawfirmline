import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsDateString, IsString, Length } from 'class-validator';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { EventResponsibilityService } from './event-responsibility.service';
class RevisionDto { @IsDateString() eventUpdatedAt!: string; }
class PreviewDto { @IsDateString() startAt!: string; }
class RescheduleDto extends PreviewDto {
  @IsString() @Length(64, 64) fingerprint!: string;
  @IsString() @Length(1, 1000) reason!: string;
}
@Controller('calendar/events')
@UseGuards(JwtAuthGuard)
export class EventResponsibilityController {
  constructor(private service: EventResponsibilityService) {}
  @Get(':id/responsibility') get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(user, id); }
  @Post(':id/acknowledge') accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.service.acknowledge(user, id, dto.eventUpdatedAt); }
  @Post(':id/complete-work') complete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.service.acknowledge(user, id, dto.eventUpdatedAt, true); }
  @Post(':id/reschedule-preview') preview(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PreviewDto) { return this.service.preview(user, id, dto.startAt); }
  @Post(':id/reschedule') reschedule(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDto) { return this.service.reschedule(user, id, dto); }
}
