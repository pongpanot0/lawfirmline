import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookSyncService } from './outlook-sync.service';
import { CaseEmailService } from '../email-intake/case-email.service';
import { AddinFileDto, AddinSuggestDto } from './dto/outlook-addin.dto';

/**
 * Outlook add-in backend. Every call acts through the CALLER's own active
 * mailbox connection — never another user's — and reuses the sync write path
 * so a filed message is stored exactly like a synced one.
 */
@Injectable()
export class OutlookAddinService {
  constructor(
    private connections: OutlookConnectionsService,
    private graph: OutlookGraphClient,
    private sync: OutlookSyncService,
    private caseEmail: CaseEmailService,
  ) {}

  private async storeMessage(user: AuthUser, graphMessageId: string) {
    const connection = await this.connections.findActiveForUser(user.id);
    if (!connection) throw new NotFoundException('ยังไม่ได้เชื่อมต่อ Microsoft 365 — กรุณาเชื่อมต่อบัญชีก่อนใช้งาน');
    const accessToken = await this.connections.getValidAccessToken(connection.id);
    const message = await this.graph.getMessage(accessToken, graphMessageId);
    const isOwnSent = message.from?.emailAddress?.address?.toLowerCase() === connection.mailboxAddress.toLowerCase();
    const stored = await this.sync.upsertGraphMessage({
      firmId: connection.firmId,
      connectionId: connection.id,
      accessToken,
      message,
      direction: isOwnSent ? 'OUTBOUND' : 'INBOUND',
      createThreadIfMissing: true,
    });
    if (!stored) throw new NotFoundException('ไม่พบอีเมลนี้');
    return stored;
  }

  async file(user: AuthUser, dto: AddinFileDto) {
    const stored = await this.storeMessage(user, dto.graphMessageId);
    const alreadyLinked = stored.caseId === dto.caseId;
    await this.caseEmail.linkThread(user, stored.threadId, dto.caseId);
    return { threadId: stored.threadId, caseId: dto.caseId, alreadyLinked };
  }

  async suggest(user: AuthUser, dto: AddinSuggestDto) {
    const stored = await this.storeMessage(user, dto.graphMessageId);
    return this.caseEmail.suggestCasesForThread(user, stored.threadId);
  }
}
