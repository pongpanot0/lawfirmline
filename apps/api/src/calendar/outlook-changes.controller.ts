import { IsString, Length } from 'class-validator';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookChangesService } from './outlook-changes.service';

class ApplyDto {
  @IsString() @Length(64, 64) fingerprint!: string;
  @IsString() @Length(1, 1000) reason!: string;
}

@Controller('calendar/events/:id')
@UseGuards(JwtAuthGuard)
export class OutlookChangesController {
  constructor(private changes: OutlookChangesService) {}

  @Get('outlook-changes')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.changes.list(user, id);
  }

  @Post('outlook-changes/:changeId/apply')
  apply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('changeId') changeId: string, @Body() dto: ApplyDto) {
    return this.changes.apply(user, id, changeId, dto);
  }

  @Post('outlook-changes/:changeId/keep')
  keep(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('changeId') changeId: string) {
    return this.changes.keep(user, id, changeId);
  }

  @Post('outlook-copies/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.changes.restoreMyCopy(user, id);
  }
}
