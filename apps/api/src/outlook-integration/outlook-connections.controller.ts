import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';

@Controller('outlook/connections')
@UseGuards(JwtAuthGuard)
export class OutlookConnectionsController {
  constructor(
    private connections: OutlookConnectionsService,
    private syncService: OutlookSyncService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.connections.listForFirm(user.firmId);
  }

  @Delete(':id')
  disconnect(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.connections.disconnect(user.firmId, id);
  }

  /** Manual "sync now" — useful while a webhook subscription is not configured (e.g. local dev without a public URL). */
  @Post(':id/sync')
  async sync(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.connections.assertOwnership(user.firmId, id);
    return this.syncService.syncConnection(id);
  }
}
