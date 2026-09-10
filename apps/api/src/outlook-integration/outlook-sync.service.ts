import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.module';
import { EmailDirection } from '../generated/prisma';
import { GraphMessage, OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { FileStorageService } from '../common/services/file-storage.service';

/**
 * Pulls new inbox messages via Graph delta query and writes them into the
 * SAME EmailThread/EmailMessage/EmailAttachment tables the mock email-intake
 * adapter uses (see apps/api/src/email-intake) — so nothing downstream
 * (field-proposal generation, the intake queue UI) needs to know whether a
 * thread came from the mock seed or a real mailbox. `provider` distinguishes
 * them; `threadKey` is the Graph `conversationId`.
 */
@Injectable()
export class OutlookSyncService {
  private readonly logger = new Logger(OutlookSyncService.name);

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private graph: OutlookGraphClient,
    private fileStorage: FileStorageService,
  ) {}

  async syncConnection(connectionId: string): Promise<{ messagesSynced: number }> {
    const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const accessToken = await this.connections.getValidAccessToken(connectionId);

    let deltaLink = connection.deltaLink;
    let messagesSynced = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await this.graph.getInboxDelta(accessToken, deltaLink);
      for (const message of page.messages) {
        await this.upsertMessage(connection.firmId, accessToken, message);
        messagesSynced += 1;
      }
      if (page.nextDeltaLink) {
        deltaLink = page.nextDeltaLink;
        hasMore = false;
      } else if (page.nextSkipLink) {
        deltaLink = page.nextSkipLink;
      } else {
        hasMore = false;
      }
    }

    await this.prisma.mailboxConnection.update({
      where: { id: connectionId },
      data: { deltaLink, lastSyncedAt: new Date() },
    });

    return { messagesSynced };
  }

  private async upsertMessage(firmId: string, accessToken: string, message: GraphMessage) {
    const thread = await this.prisma.emailThread.upsert({
      where: { firmId_provider_threadKey: { firmId, provider: 'microsoft', threadKey: message.conversationId } },
      update: { lastMessageAt: new Date(message.receivedDateTime), subject: message.subject ?? '(ไม่มีหัวข้อ)' },
      create: {
        firmId,
        provider: 'microsoft',
        threadKey: message.conversationId,
        subject: message.subject ?? '(ไม่มีหัวข้อ)',
        fromName: message.from?.emailAddress?.name ?? null,
        fromAddress: message.from?.emailAddress?.address ?? null,
        lastMessageAt: new Date(message.receivedDateTime),
      },
    });

    const existing = await this.prisma.emailMessage.findFirst({
      where: { threadId: thread.id, messageKey: message.internetMessageId },
    });
    if (existing) return; // Delta can redeliver — messageKey is unique per thread, so this is a no-op.

    const emailMessage = await this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        provider: 'microsoft',
        messageKey: message.internetMessageId,
        direction: EmailDirection.INBOUND,
        fromName: message.from?.emailAddress?.name ?? null,
        fromAddress: message.from?.emailAddress?.address ?? null,
        bodyText: message.bodyPreview ?? message.body?.content ?? null,
        receivedAt: new Date(message.receivedDateTime),
      },
    });

    if (message.hasAttachments) {
      await this.syncAttachments(firmId, accessToken, message.id, emailMessage.id);
    }
  }

  private async syncAttachments(firmId: string, accessToken: string, graphMessageId: string, emailMessageId: string) {
    let attachments: Awaited<ReturnType<OutlookGraphClient['getAttachments']>>;
    try {
      attachments = await this.graph.getAttachments(accessToken, graphMessageId);
    } catch (error) {
      this.logger.warn(`Failed to fetch attachments for message ${graphMessageId}: ${error}`);
      return;
    }

    for (const attachment of attachments) {
      if (!attachment.contentBytes) continue; // Large/reference attachments — skip for now, not core path.
      const key = path.posix.join('outlook', firmId, emailMessageId, attachment.name);
      const storagePath = await this.fileStorage.put(
        key,
        Buffer.from(attachment.contentBytes, 'base64'),
        attachment.contentType,
      );
      await this.prisma.emailAttachment.create({
        data: {
          messageId: emailMessageId,
          filename: attachment.name,
          storagePath,
          mimeType: attachment.contentType,
        },
      });
    }
  }
}
