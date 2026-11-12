import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OutlookCalendarItemsService } from './outlook-calendar-items.service';

@Controller('calendar/outlook-items')
@UseGuards(JwtAuthGuard)
export class OutlookCalendarItemsController {
  constructor(private items: OutlookCalendarItemsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.items.get(user, from, to);
  }
}
