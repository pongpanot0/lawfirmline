import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.module';
import { CaseExternalLinkKind, MailboxConnectionStatus } from '../generated/prisma';
import { GraphApiError, GraphDeltaResult, GraphMessage, OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';

/** Delta reports deletions/moves-out as `{ id, '@removed': {...} }` — email already filed in the case stays there. */
const isRemoved = (message: GraphMessage) => '@removed' in message;

export function describeFolderSyncError(error: unknown): string {
  if (error instanceof GraphApiError && error.status === 404) {
    return 'ไม่พบ folder นี้ใน Outlook แล้ว (อาจถูกลบหรือย้าย) — ยกเลิกการผูกแล้วผูกใหม่จากหน้าคดี';
  }
  return `ซิงก์ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Pulls mail from Outlook folders linked to a case (CaseExternalLink kind
 * OUTLOOK_FOLDER) via a per-folder delta query and files every message into
 * that case through OutlookSyncService.upsertGraphMessage. The first run on a
 * fresh link (deltaLink null) is the full backfill.
 */
@Injectable()
export class CaseFolderSyncService {
  private readonly logger = new Logger(CaseFolderSyncService.name);
  // ponytail: in-process guard only — two API instances could still sync one link at once; messageKey dedup absorbs it bar a rare unique-constraint race. Move to a DB lease if the API is scaled out.
  private readonly inFlight = new Set<string>();
  private cronRunning = false;

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private graph: OutlookGraphClient,
    private mailSync: OutlookSyncService,
  ) {}

  async syncLink(linkId: string): Promise<{ messagesSynced: number }> {
    if (this.inFlight.has(linkId)) return { messagesSynced: 0 };
    this.inFlight.add(linkId);
    try {
      return await this.runLink(linkId);
    } finally {
      this.inFlight.delete(linkId);
    }
  }

  private async runLink(linkId: string): Promise<{ messagesSynced: number }> {
    const link = await this.prisma.caseExternalLink.findUniqueOrThrow({
      where: { id: linkId },
      include: { connection: { select: { mailboxAddress: true } } },
    });
    try {
      const accessToken = await this.connections.getValidAccessToken(link.connectionId);
      const ownMailbox = link.connection.mailboxAddress.toLowerCase();
      let cursor = link.deltaLink;
      let resetDone = false;
      let messagesSynced = 0;

      for (;;) {
        let page: GraphDeltaResult;
        try {
          page = await this.graph.getFolderDelta(accessToken, link.externalId, cursor);
        } catch (error) {
          if (error instanceof GraphApiError && error.status === 410 && cursor && !resetDone) {
            // Graph dropped the sync state (long downtime) — resync the whole folder; messageKey dedup keeps it idempotent.
            cursor = null;
            resetDone = true;
            continue;
          }
          throw error;
        }

        for (const message of page.messages) {
          if (isRemoved(message)) continue;
          const sender = message.from?.emailAddress?.address?.toLowerCase();
          const result = await this.mailSync.upsertGraphMessage({
            firmId: link.firmId,
            connectionId: link.connectionId,
            accessToken,
            message,
            direction: sender === ownMailbox ? 'OUTBOUND' : 'INBOUND',
            caseId: link.caseId,
            createThreadIfMissing: true,
          });
          if (result) messagesSynced += 1;
        }

        const next = page.nextDeltaLink ?? page.nextSkipLink;
        if (next) {
          cursor = next;
          // Saved per page so an interrupted first backfill resumes instead of starting over.
          await this.prisma.caseExternalLink.update({ where: { id: linkId }, data: { deltaLink: cursor } });
        }
        if (page.nextDeltaLink || !page.nextSkipLink) break;
      }

      await this.prisma.caseExternalLink.update({
        where: { id: linkId },
        data: { lastSyncedAt: new Date(), lastError: null },
      });
      return { messagesSynced };
    } catch (error) {
      await this.prisma.caseExternalLink
        .update({ where: { id: linkId }, data: { lastError: describeFolderSyncError(error).slice(0, 2000) } })
        .catch(() => undefined); // link may have been unlinked mid-sync
      throw error;
    }
  }

  async syncCase(caseId: string): Promise<{ messagesSynced: number; errors: string[] }> {
    const links = await this.prisma.caseExternalLink.findMany({
      where: { caseId, kind: CaseExternalLinkKind.OUTLOOK_FOLDER, connection: { status: MailboxConnectionStatus.ACTIVE } },
      select: { id: true, displayPath: true },
    });
    let messagesSynced = 0;
    const errors: string[] = [];
    for (const link of links) {
      try {
        messagesSynced += (await this.syncLink(link.id)).messagesSynced;
      } catch (error) {
        errors.push(`${link.displayPath}: ${describeFolderSyncError(error)}`);
      }
    }
    return { messagesSynced, errors };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAllLinks(): Promise<void> {
    if (this.cronRunning) return;
    this.cronRunning = true;
    try {
      const links = await this.prisma.caseExternalLink.findMany({
        where: {
          kind: CaseExternalLinkKind.OUTLOOK_FOLDER,
          connection: { status: MailboxConnectionStatus.ACTIVE },
          case: { deletedAt: null },
        },
        select: { id: true },
      });
      for (const link of links) {
        try {
          await this.syncLink(link.id);
        } catch (error) {
          this.logger.warn(`Folder link ${link.id} sync failed: ${error}`);
        }
      }
    } finally {
      this.cronRunning = false;
    }
  }
}
