import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Logger } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';
import { OutlookCalendarSyncService } from './calendar/outlook-calendar-sync.service';
import { UpdateConnectionSettingsDto } from './dto/update-connection-settings.dto';

@Controller('outlook/connections')
@UseGuards(JwtAuthGuard)
export class OutlookConnectionsController {
  private readonly logger = new Logger(OutlookConnectionsController.name);

  constructor(
    private connections: OutlookConnectionsService,
    private syncService: OutlookSyncService,
    private subscriptions: OutlookSubscriptionService,
    private calendarSync: OutlookCalendarSyncService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.connections.listMine(user);
  }

  @Patch(':id')
  async updateSettings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateConnectionSettingsDto) {
    const { before, after } = await this.connections.updateSettings(user, id, dto);
    // The setting is saved. Nothing retries a failed follow-up; the user can toggle again.
    // Each step is independent so one failure never skips the other, and records its own error.
    try {
      if (!before.syncInboxToIntake && after.syncInboxToIntake) await this.subscriptions.ensureSubscription(id);
      if (before.syncInboxToIntake && !after.syncInboxToIntake) await this.subscriptions.removeSubscription(id);
    } catch (error) {
      this.logger.warn(`Subscription change for ${id} failed: ${error}`);
      await this.connections.recordError(id, `Subscription follow-up failed: ${error}`).catch(() => undefined);
    }
    try {
      if (before.syncCalendar && !after.syncCalendar) await this.calendarSync.removeAllForConnection(id);
    } catch (error) {
      this.logger.warn(`Calendar cleanup for ${id} failed: ${error}`);
      await this.connections.recordError(id, `Calendar cleanup failed: ${error}`).catch(() => undefined);
    }
    return this.connections.getSafe(user.firmId, id);
  }

  /** Shown before disconnecting — how many case links depend on this mailbox. */
  @Get(':id/case-links')
  async caseLinks(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.connections.assertCanManage(user, id);
    return this.connections.caseLinkSummary(user.firmId, id);
  }

  @Delete(':id')
  async disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.connections.assertCanManage(user, id);
    // Remove the Outlook copies while the tokens still work; never block the disconnect.
    await this.calendarSync.removeAllForConnection(id).catch((error) => this.logger.warn(`Calendar cleanup for ${id} failed: ${error}`));
    return this.connections.disconnect(user.firmId, id);
  }

  /** Manual "sync now" — useful while a webhook subscription is not configured (e.g. local dev without a public URL). */
  @Post(':id/sync')
  async sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.connections.assertCanManage(user, id);
    return this.syncService.syncConnection(id);
  }
}
