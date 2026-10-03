import { Body, Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { NotificationCategory } from '../generated/prisma';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { NotificationCenterService } from './notification-center.service';
import { ListNotificationsQueryDto, UpdateChannelSwitchesDto } from './dto/notification-center.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
@SkipSubscription()
export class NotificationCenterController {
  constructor(private center: NotificationCenterService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQueryDto) {
    return this.center.list(user.id, user.firmId, query.cursor);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.center.unreadCount(user.id, user.firmId);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.center.markAllRead(user.id, user.firmId);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.center.markRead(user.id, id);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser) {
    return this.center.preferences(user.id);
  }

  @Patch('preferences/:category')
  setPreference(
    @CurrentUser() user: AuthUser,
    @Param('category', new ParseEnumPipe(NotificationCategory)) category: NotificationCategory,
    @Body() dto: UpdateChannelSwitchesDto,
  ) {
    return this.center.setPreference(user.id, category, dto);
  }
}
