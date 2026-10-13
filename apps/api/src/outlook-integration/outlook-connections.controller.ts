import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Logger } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';
import { UpdateConnectionSettingsDto } from './dto/update-connection-settings.dto';

@Controller('outlook/connections')
@UseGuards(JwtAuthGuard)
export class OutlookConnectionsController {
  private readonly logger = new Logger(OutlookConnectionsController.name);

  constructor(
    private connections: OutlookConnectionsService,
    private syncService: OutlookSyncService,
    private subscriptions: OutlookSubscriptionService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.connections.listForFirm(user);
  }

  @Patch(':id')
  async updateSettings(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateConnectionSettingsDto) {
    const { before, after } = await this.connections.updateSettings(user, id, dto);
    try {
      if (!before.syncInboxToIntake && after.syncInboxToIntake) await this.subscriptions.ensureSubscription(id);
      if (before.syncInboxToIntake && !after.syncInboxToIntake) await this.subscriptions.removeSubscription(id);
    } catch (error) {
      this.logger.warn(`Subscription change for ${id} failed: ${error}`); // setting is saved; renew cron retries
    }
    // Calendar cleanup is wired in a later task.
    const rows = await this.connections.listForFirm(user);
    return rows.find((r) => r.id === id);
  }

  @Delete(':id')
  async disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.connections.assertCanManage(user, id);
    return this.connections.disconnect(user.firmId, id);
  }

  /** Manual "sync now" — useful while a webhook subscription is not configured (e.g. local dev without a public URL). */
  @Post(':id/sync')
  async sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.connections.assertCanManage(user, id);
    return this.syncService.syncConnection(id);
  }
}
