import { Module } from '@nestjs/common';
import { OutlookOAuthController } from './outlook-oauth.controller';
import { OutlookWebhookController } from './outlook-webhook.controller';
import { OutlookConnectionsController } from './outlook-connections.controller';
import { OutlookOAuthService } from './outlook-oauth.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';

@Module({
  controllers: [OutlookOAuthController, OutlookWebhookController, OutlookConnectionsController],
  providers: [
    OutlookOAuthService,
    OutlookGraphClient,
    OutlookConnectionsService,
    OutlookSyncService,
    OutlookSubscriptionService,
  ],
})
export class OutlookIntegrationModule {}
