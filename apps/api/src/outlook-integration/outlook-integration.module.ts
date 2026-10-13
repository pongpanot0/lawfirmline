import { Module } from '@nestjs/common';
import { OutlookOAuthController } from './outlook-oauth.controller';
import { OutlookWebhookController } from './outlook-webhook.controller';
import { OutlookConnectionsController } from './outlook-connections.controller';
import { FirmLinkService } from '../notifications/firm-link.service';
import { OutlookOAuthService } from './outlook-oauth.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { GraphHttp } from './graph/graph-http';
import { GraphCalendarClient } from './graph/graph-calendar.client';
import { OutlookSubscriptionService } from './outlook-subscription.service';

@Module({
  controllers: [OutlookOAuthController, OutlookWebhookController, OutlookConnectionsController],
  providers: [
    GraphHttp,
    GraphCalendarClient,
    OutlookOAuthService,
    OutlookGraphClient,
    OutlookConnectionsService,
    OutlookSyncService,
    OutlookSubscriptionService,
    FirmLinkService,
  ],
  exports: [GraphHttp, GraphCalendarClient, OutlookGraphClient, OutlookConnectionsService],
})
export class OutlookIntegrationModule {}
