import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.module';
import { EmailDirection, EmailThreadStatus } from '../generated/prisma';
import { GraphMessage, GraphRecipient, OutlookGraphClient } from './outlook-graph.client';
import { htmlToText } from './mail/html-to-text';
import { OutlookConnectionsService } from './outlook-connections.service';
import { CaseEmailNotifier, NewInboundBatch, trackNewInbound } from './case-email-notifier.service';
import { FileStorageService } from '../common/services/file-storage.service';

type Direction = 'INBOUND' | 'OUTBOUND';
const addresses = (list?: GraphRecipient[]) =>
  (list ?? []).map((r) => r.emailAddress?.address?.toLowerCase()).filter((a): a is string => !!a);

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

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
    private emailNotifier: CaseEmailNotifier,
  ) {}

  async syncConnection(connectionId: string): Promise<{ messagesSynced: number }> {
    const connection = await this.prisma.mailboxConnection.findUniqueOrThrow({ where: { id: connectionId } });
    const accessToken = await this.connections.getValidAccessToken(connectionId);
    let messagesSynced = 0;
    const data: { deltaLink?: string | null; sentDeltaLink?: string | null; lastSyncedAt: Date } = { lastSyncedAt: new Date() };

    const fresh: NewInboundBatch = new Map();

    if (connection.syncInboxToIntake) {
      const inbox = await this.drainFolder(accessToken, 'inbox', connection.deltaLink, async (message) => {
        const result = await this.upsertGraphMessage({ firmId: connection.firmId, connectionId, accessToken, message, direction: 'INBOUND', createThreadIfMissing: true });
        // The first inbox sync is a backfill — never alert for it.
        if (connection.deltaLink) trackNewInbound(fresh, result, 'INBOUND', message);
        return result;
      });
      messagesSynced += inbox.count;
      data.deltaLink = inbox.deltaLink;
    }

    // Sent mail only joins conversations we already hold (intake or case threads),
    // so a lawyer's unrelated outgoing mail never surfaces in the system.
    const sent = await this.drainFolder(accessToken, 'sentitems', connection.sentDeltaLink, (message) =>
      this.upsertGraphMessage({ firmId: connection.firmId, connectionId, accessToken, message, direction: 'OUTBOUND', createThreadIfMissing: false }),
    );
    messagesSynced += sent.count;
    data.sentDeltaLink = sent.deltaLink;

    await this.prisma.mailboxConnection.update({ where: { id: connectionId }, data });
    if (fresh.size) await this.emailNotifier.notifyBatch(fresh, connection.userId ?? connection.connectedByUserId);
    return { messagesSynced };
  }

  /** Pages through one folder's delta. Exposed for case-folder sync (plan B). */
  async drainFolder(
    accessToken: string,
    folder: string,
    deltaLink: string | null,
    onMessage: (m: GraphMessage) => Promise<unknown>,
  ): Promise<{ count: number; deltaLink: string | null }> {
    let link = deltaLink;
    let count = 0;
    for (;;) {
      const page = await this.graph.getFolderDelta(accessToken, folder, link);
      for (const message of page.messages) {
        if (await onMessage(message)) count += 1;
      }
      if (page.nextSkipLink) {
        link = page.nextSkipLink;
        continue;
      }
      return { count, deltaLink: page.nextDeltaLink ?? link };
    }
  }

  async upsertGraphMessage(p: {
    firmId: string;
    connectionId: string;
    accessToken: string;
    message: GraphMessage;
    direction: Direction;
    caseId?: string | null;
    createThreadIfMissing: boolean;
  }): Promise<{ threadId: string; messageId: string; created: boolean; caseId: string | null } | null> {
    const { message } = p;
    const key = { firmId_provider_threadKey: { firmId: p.firmId, provider: 'microsoft', threadKey: message.conversationId } };
    const at = new Date(message.receivedDateTime ?? message.sentDateTime ?? Date.now());
    const subject = message.subject ?? '(ไม่มีหัวข้อ)';

    let thread = await this.prisma.emailThread.findUnique({ where: key });
    let created = false;
    if (!thread) {
      if (!p.createThreadIfMissing) return null;
      try {
        thread = await this.prisma.emailThread.create({
          data: {
            firmId: p.firmId,
            provider: 'microsoft',
            threadKey: message.conversationId,
            subject,
            fromName: message.from?.emailAddress?.name ?? null,
            fromAddress: message.from?.emailAddress?.address ?? null,
            lastMessageAt: at,
            mailboxConnectionId: p.connectionId,
            caseId: p.caseId ?? null,
            ...(p.caseId ? { status: EmailThreadStatus.LINKED } : {}),
          },
        });
        created = true;
      } catch (error) {
        // A concurrent sync (webhook + poll) created it first — carry on with that row, applying the usual link/refresh below.
        if (!isUniqueViolation(error)) throw error;
        thread = await this.prisma.emailThread.findUnique({ where: key });
        if (!thread) throw error;
      }
    }
    if (!created) {
      const data = {
        ...(thread.subject === subject ? {} : { subject }),
        ...(thread.lastMessageAt && at <= thread.lastMessageAt ? {} : { lastMessageAt: at }),
        ...(p.caseId && !thread.caseId && !thread.caseUnlinkedAt ? { caseId: p.caseId, status: EmailThreadStatus.LINKED } : {}),
      };
      if (Object.keys(data).length) thread = await this.prisma.emailThread.update({ where: { id: thread.id }, data });
    }

    const existing = await this.prisma.emailMessage.findFirst({ where: { threadId: thread.id, messageKey: message.internetMessageId } });
    if (existing) {
      // A previous run may have stored the message but failed on its attachments (Graph never redelivers it) — retry once if none were saved.
      if (message.hasAttachments && (await this.prisma.emailAttachment.count({ where: { messageId: existing.id } })) === 0) {
        await this.syncAttachments(p.firmId, p.accessToken, message.id, existing.id);
      }
      return { threadId: thread.id, messageId: existing.id, created: false, caseId: thread.caseId };
    }

    const html = message.body?.contentType?.toLowerCase() === 'html' ? message.body.content : null;
    const bodyText = html ? htmlToText(html) : (message.body?.content ?? message.bodyPreview ?? null);
    let emailMessage: { id: string };
    try {
      emailMessage = await this.prisma.emailMessage.create({
        data: {
          threadId: thread.id,
          provider: 'microsoft',
          messageKey: message.internetMessageId,
          graphMessageId: message.id,
          direction: p.direction === 'OUTBOUND' ? EmailDirection.OUTBOUND : EmailDirection.INBOUND,
          fromName: message.from?.emailAddress?.name ?? null,
          fromAddress: message.from?.emailAddress?.address ?? null,
          toAddresses: addresses(message.toRecipients),
          ccAddresses: addresses(message.ccRecipients),
          bodyHtml: html,
          bodyText,
          receivedAt: at,
        },
      });
    } catch (error) {
      // Concurrent sync stored the same message first (unique [threadId, messageKey]).
      if (!isUniqueViolation(error)) throw error;
      const dup = await this.prisma.emailMessage.findFirst({ where: { threadId: thread.id, messageKey: message.internetMessageId } });
      if (!dup) throw error;
      return { threadId: thread.id, messageId: dup.id, created: false, caseId: thread.caseId };
    }
    if (message.hasAttachments) await this.syncAttachments(p.firmId, p.accessToken, message.id, emailMessage.id);
    return { threadId: thread.id, messageId: emailMessage.id, created: true, caseId: thread.caseId };
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
      // Sender-chosen name: keep only the last segment so it can never climb out of this message's folder.
      const safeName = path.posix.basename(attachment.name.replace(/\\/g, '/'));
      const key = path.posix.join('outlook', firmId, emailMessageId, safeName && safeName !== '..' && safeName !== '.' ? safeName : 'attachment');
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
