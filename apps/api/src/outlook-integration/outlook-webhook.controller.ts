import { Body, Controller, Logger, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.module';
import { SkipSubscription } from '../saas/decorators/saas.decorators';
import { OutlookSyncService } from './outlook-sync.service';

interface GraphNotification {
  subscriptionId: string;
  clientState?: string;
  resource: string;
}

/**
 * Microsoft Graph change notifications. Two responsibilities that must
 * both stay fast (Graph expects a response within seconds, or it backs off
 * and eventually deletes the subscription):
 *
 * 1. Validation handshake — when Graph is creating/renewing a subscription
 *    it GETs^H^H POSTs here with a `validationToken` query param and expects
 *    it echoed back as `text/plain` within 10 seconds. No auth on this leg.
 * 2. Notification delivery — a signed batch of "something changed" events.
 *    `clientState` is checked against the per-connection secret so a
 *    forged POST to this public endpoint cannot trigger a sync; the actual
 *    changed data is then pulled via the delta query, not trusted from the
 *    notification body itself.
 */
@Controller('outlook/webhook')
export class OutlookWebhookController {
  private readonly logger = new Logger(OutlookWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private syncService: OutlookSyncService,
  ) {}

  @Post()
  @SkipSubscription()
  async receive(@Query('validationToken') validationToken: string | undefined, @Body() body: { value?: GraphNotification[] }, @Res() res: Response) {
    if (validationToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(validationToken);
    }

    res.status(202).send();

    for (const notification of body.value ?? []) {
      this.handleNotification(notification).catch((error) => {
        this.logger.error(`Failed to process notification for subscription ${notification.subscriptionId}: ${error}`);
      });
    }
  }

  private async handleNotification(notification: GraphNotification) {
    const connection = await this.prisma.mailboxConnection.findFirst({
      where: { graphSubscriptionId: notification.subscriptionId },
    });
    if (!connection) {
      this.logger.warn(`Notification for unknown subscription ${notification.subscriptionId}`);
      return;
    }
    if (notification.clientState !== connection.webhookSecret) {
      this.logger.warn(`Notification clientState mismatch for connection ${connection.id} — ignoring`);
      return;
    }
    await this.syncService.syncConnection(connection.id);
  }
}
