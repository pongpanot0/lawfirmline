import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { MailboxConnectionStatus } from '../generated/prisma';
import { decryptToken, encryptToken } from '../common/utils/token-encryption.util';
import { GraphApiError, GraphTokens, OutlookGraphClient } from './outlook-graph.client';
import { OutlookOAuthService } from './outlook-oauth.service';

const SAFE_SELECT = {
  id: true,
  firmId: true,
  mailboxAddress: true,
  connectedByUserId: true,
  status: true,
  lastError: true,
  lastSyncedAt: true,
  subscriptionExpiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class OutlookConnectionsService {
  private readonly logger = new Logger(OutlookConnectionsService.name);

  constructor(
    private prisma: PrismaService,
    private oauth: OutlookOAuthService,
    private graph: OutlookGraphClient,
  ) {}

  listForFirm(firmId: string) {
    return this.prisma.mailboxConnection.findMany({
      where: { firmId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getRaw(firmId: string, id: string) {
    const connection = await this.prisma.mailboxConnection.findFirst({ where: { id, firmId } });
    if (!connection) throw new NotFoundException('ไม่พบการเชื่อมต่อนี้');
    return connection;
  }

  /** Throws 404 unless `id` belongs to `firmId` — call before any action keyed only by connection id. */
  async assertOwnership(firmId: string, id: string): Promise<void> {
    await this.getRaw(firmId, id);
  }

  /**
   * Creates the connection row (or replaces the tokens on an existing one
   * for the same mailbox — reconnecting after a revoked/expired state).
   * Each mailbox is tied to one firm; connecting the same mailbox again
   * updates rather than duplicates.
   */
  async upsertFromOAuth(user: AuthUser, tokens: GraphTokens, mailboxAddress: string) {
    return this.prisma.mailboxConnection.upsert({
      where: { firmId_mailboxAddress: { firmId: user.firmId, mailboxAddress } },
      create: {
        firmId: user.firmId,
        mailboxAddress,
        connectedByUserId: user.id,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        webhookSecret: crypto.randomBytes(24).toString('hex'),
        status: MailboxConnectionStatus.ACTIVE,
      },
      update: {
        connectedByUserId: user.id,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        status: MailboxConnectionStatus.ACTIVE,
        lastError: null,
      },
    });
  }

  /**
   * Returns a valid access token, refreshing it first if it is expiring
   * within 5 minutes. On a refresh failure (revoked consent, deleted app
   * registration, ...) the connection is marked EXPIRED so it stops being
   * used silently — the firm sees it on /settings/integrations and has to
   * reconnect, rather than sync failing invisibly forever.
   */
  async getValidAccessToken(connectionId: string): Promise<string> {
    const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const expiringSoon = connection.tokenExpiresAt.getTime() - Date.now() < 5 * 60_000;
    if (!expiringSoon) {
      return decryptToken(connection.accessTokenEnc);
    }

    try {
      const refreshed = await this.oauth.refreshTokens(decryptToken(connection.refreshTokenEnc));
      await this.prisma.mailboxConnection.update({
        where: { id: connectionId },
        data: {
          accessTokenEnc: encryptToken(refreshed.accessToken),
          // Microsoft may or may not rotate the refresh token — keep the old one if it didn't.
          refreshTokenEnc: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : connection.refreshTokenEnc,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        },
      });
      return refreshed.accessToken;
    } catch (error) {
      await this.markError(connectionId, MailboxConnectionStatus.EXPIRED, `Token refresh failed: ${error}`);
      throw new BadRequestException('การเชื่อมต่อ Outlook หมดอายุ กรุณาเชื่อมต่อใหม่');
    }
  }

  async markError(connectionId: string, status: MailboxConnectionStatus, message: string) {
    this.logger.warn(`MailboxConnection ${connectionId}: ${message}`);
    await this.prisma.mailboxConnection.update({
      where: { id: connectionId },
      data: { status, lastError: message.slice(0, 2000) },
    });
  }

  async disconnect(firmId: string, id: string) {
    const connection = await this.getRaw(firmId, id);
    if (connection.graphSubscriptionId) {
      try {
        const accessToken = await this.getValidAccessToken(connection.id);
        await this.graph.deleteSubscription(accessToken, connection.graphSubscriptionId);
      } catch (error) {
        // Best-effort — the connection is being removed either way, and a
        // subscription Graph can no longer reach expires on its own.
        this.logger.warn(`Could not delete Graph subscription on disconnect: ${error}`);
      }
    }
    // Wipe the tokens rather than deleting the row, so who connected/
    // disconnected the mailbox and when stays in the audit trail.
    await this.prisma.mailboxConnection.update({
      where: { id: connection.id },
      data: {
        status: MailboxConnectionStatus.REVOKED,
        accessTokenEnc: '',
        refreshTokenEnc: '',
        graphSubscriptionId: null,
        subscriptionExpiresAt: null,
      },
    });
    return { revoked: true };
  }

  isRevocationError(error: unknown): boolean {
    return error instanceof GraphApiError && error.status === 401;
  }
}
