import { forwardRef, Module } from '@nestjs/common';
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
import { CaseFolderSyncService } from './case-folder-sync.service';
import { CaseFolderLinksController } from './case-folder-links.controller';
import { CaseFolderLinksService } from './case-folder-links.service';
import { GraphMailFoldersClient } from './graph/graph-mail-folders.client';
import { OutlookCalendarSyncService } from './calendar/outlook-calendar-sync.service';
import { CaseEmailSendController } from './case-email-send.controller';
import { GraphDriveClient } from './graph/graph-drive.client';
import { NotificationsModule } from '../notifications/notifications.module';
import { CaseEmailNotifier } from './case-email-notifier.service';
import { OutlookSendService } from './outlook-send.service';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [OutlookOAuthController, OutlookWebhookController, OutlookConnectionsController, CaseFolderLinksController, CaseEmailSendController],
  providers: [
    GraphHttp,
    GraphCalendarClient,
    OutlookOAuthService,
    OutlookGraphClient,
    OutlookConnectionsService,
    OutlookSyncService,
    OutlookSubscriptionService,
    OutlookCalendarSyncService,
    GraphMailFoldersClient,
    CaseFolderSyncService,
    CaseFolderLinksService,
    FirmLinkService,
    OutlookSendService,
    GraphDriveClient,
    CaseEmailNotifier,
  ],
  exports: [GraphHttp, GraphCalendarClient, OutlookGraphClient, OutlookConnectionsService, OutlookCalendarSyncService, GraphDriveClient],
})
export class OutlookIntegrationModule {}
