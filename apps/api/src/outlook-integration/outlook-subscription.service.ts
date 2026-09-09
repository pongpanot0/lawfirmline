import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';
import { MailboxConnectionStatus } from '../generated/prisma';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';

@Injectable()
export class OutlookSubscriptionService {
  private readonly logger = new Logger(OutlookSubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private graph: OutlookGraphClient,
    private config: ConfigService,
  ) {}

  async ensureSubscription(connectionId: string) {
    const webhookUrl = this.config.get<string>('OUTLOOK_WEBHOOK_URL');
    if (!webhookUrl) {
      this.logger.warn('OUTLOOK_WEBHOOK_URL not set — skipping subscription, falling back to polling only.');
      return;
    }
    const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const accessToken = await this.connections.getValidAccessToken(connectionId);
    const subscription = await this.graph.createSubscription(accessToken, webhookUrl, connection.webhookSecret);
    await this.prisma.mailboxConnection.update({
      where: { id: connectionId },
      data: {
        graphSubscriptionId: subscription.id,
        subscriptionExpiresAt: new Date(subscription.expirationDateTime),
      },
    });
  }

  /**
   * Graph mail subscriptions max out at ~3 days — this runs often enough
   * that a connection is never more than an hour from being renewed, well
   * inside the window before expiry.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async renewExpiringSubscriptions() {
    const threshold = new Date(Date.now() + 6 * 60 * 60_000);
    const expiring = await this.prisma.mailboxConnection.findMany({
      where: {
        status: MailboxConnectionStatus.ACTIVE,
        graphSubscriptionId: { not: null },
        subscriptionExpiresAt: { lt: threshold },
      },
    });

    for (const connection of expiring) {
      try {
        const accessToken = await this.connections.getValidAccessToken(connection.id);
        const renewed = await this.graph.renewSubscription(accessToken, connection.graphSubscriptionId!);
        await this.prisma.mailboxConnection.update({
          where: { id: connection.id },
          data: { subscriptionExpiresAt: new Date(renewed.expirationDateTime) },
        });
      } catch (error) {
        // The subscription may have been deleted server-side (consent
        // revoked, mailbox moved) — recreate rather than loop forever on a
        // renew call that will never succeed.
        this.logger.warn(`Renewing subscription for ${connection.id} failed, recreating: ${error}`);
        try {
          await this.ensureSubscription(connection.id);
        } catch (recreateError) {
          await this.connections.markError(
            connection.id,
            MailboxConnectionStatus.ERROR,
            `Subscription renewal and recreation both failed: ${recreateError}`,
          );
        }
      }
    }
  }
}
