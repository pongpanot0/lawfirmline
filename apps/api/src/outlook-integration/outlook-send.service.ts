import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { MailboxConnectionStatus } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { escapeHtml } from '../notifications/email.service';
import {
  GraphApiError,
  GraphFileAttachmentInput,
  GraphMessage,
  GraphRecipient,
  OutlookGraphClient,
} from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { SendCaseEmailDto } from './dto/send-case-email.dto';

export const MAX_RECIPIENTS = 50;
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
/** base64 inflates ~33% and Exchange caps a message near 35 MB. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const CASE_EMAIL_SENT = 'CASE_EMAIL_SENT';

export type SendMode = 'NEW' | 'REPLY' | 'REPLY_AS_NEW';

export interface SendCaseEmailResult {
  mode: SendMode;
  threadId: string | null;
  /** false = Microsoft sent it, but writing it into the case's email tab failed. */
  recorded: boolean;
}

export interface RecipientOption {
  name: string;
  email: string;
  source: 'CLIENT_CONTACT' | 'PARTICIPANT';
  group: string;
}

type ClientWithContacts = { name: string; contacts: { name: string; email: string | null }[] } | null;

export interface RecipientSourceCase {
  client: ClientWithContacts;
  additionalClients: { client: ClientWithContacts }[];
  customers: { customer: ClientWithContacts }[];
  participants: { name: string; email: string | null }[];
}

/** Everyone in the case with an email address, client contacts first, one entry per address. */
export function buildRecipientOptions(c: RecipientSourceCase): RecipientOption[] {
  const byEmail = new Map<string, RecipientOption>();
  const add = (name: string, email: string | null, source: RecipientOption['source'], group: string) => {
    const address = email?.trim();
    if (!address || byEmail.has(address.toLowerCase())) return;
    byEmail.set(address.toLowerCase(), { name, email: address, source, group });
  };
  const clients = [c.client, ...c.additionalClients.map((x) => x.client), ...c.customers.map((x) => x.customer)];
  for (const client of clients) {
    for (const contact of client?.contacts ?? []) add(contact.name, contact.email, 'CLIENT_CONTACT', client!.name);
  }
  for (const participant of c.participants) add(participant.name, participant.email, 'PARTICIPANT', 'คู่ความ');
  return [...byEmail.values()];
}

function uniqueAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  return list
    .map((address) => address.trim())
    .filter((address) => {
      const key = address.toLowerCase();
      if (!address || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const recipients = (addresses: string[]): GraphRecipient[] => addresses.map((address) => ({ emailAddress: { address } }));
const textToHtml = (text: string) => `<div>${escapeHtml(text).replace(/\r?\n/g, '<br>')}</div>`;

/** Our text goes above Outlook's quoted original — inside <body> when the draft is a full HTML document. */
export function prependToHtml(original: string | undefined, html: string): string {
  if (!original) return html;
  const merged = original.replace(/<body[^>]*>/i, (tag) => `${tag}${html}<br>`);
  return merged === original ? `${html}<br>${original}` : merged;
}

interface ReplySource {
  id: string;
  graphMessageId: string | null;
  thread: { mailboxConnectionId: string | null };
}

interface OutgoingMail {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
}

interface LoadedAttachment {
  documentId: string;
  file: GraphFileAttachmentInput;
}

/**
 * Sends case email from the signed-in user's OWN Microsoft mailbox — never a
 * colleague's — and files the sent message under the case right away
 * (Sent Items sync later dedups on internetMessageId).
 */
@Injectable()
export class OutlookSendService {
  private readonly logger = new Logger(OutlookSendService.name);
  // ponytail: per-process guard for a double-click racing the audit-log check; a second API instance would need a DB unique key.
  private readonly inFlight = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private graph: OutlookGraphClient,
    private sync: OutlookSyncService,
    private fileStorage: FileStorageService,
  ) {}

  async composeOptions(user: AuthUser, caseId: string) {
    const contacts = { select: { name: true, email: true } } as const;
    const clientSelect = { select: { name: true, contacts } } as const;
    const [connection, legalCase] = await Promise.all([
      this.connections.findActiveForUser(user.id),
      this.prisma.case.findFirst({
        where: { id: caseId, firmId: user.firmId },
        select: {
          ownRef: true,
          client: clientSelect,
          additionalClients: { select: { client: clientSelect } },
          customers: { select: { customer: clientSelect } },
          participants: { select: { name: true, email: true } },
        },
      }),
    ]);
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้');
    return {
      mailboxAddress: connection?.mailboxAddress ?? null,
      ownRef: legalCase.ownRef,
      recipients: buildRecipientOptions(legalCase),
    };
  }

  async send(user: AuthUser, caseId: string, dto: SendCaseEmailDto): Promise<SendCaseEmailResult> {
    const key = dto.clientRequestId ? `${user.id}:${dto.clientRequestId}` : null;
    if (key) {
      if (this.inFlight.has(key)) throw new ConflictException('อีเมลนี้ส่งไปแล้ว');
      this.inFlight.add(key);
    }
    try {
      if (dto.clientRequestId && (await this.alreadySent(user, dto.clientRequestId))) {
        throw new ConflictException('อีเมลนี้ส่งไปแล้ว');
      }
      return await this.sendOnce(user, caseId, dto);
    } finally {
      if (key) this.inFlight.delete(key);
    }
  }

  private async alreadySent(user: AuthUser, clientRequestId: string): Promise<boolean> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        firmId: user.firmId,
        userId: user.id,
        action: CASE_EMAIL_SENT,
        metadata: { path: ['clientRequestId'], equals: clientRequestId },
      },
      select: { id: true },
    });
    return !!row;
  }

  private async sendOnce(user: AuthUser, caseId: string, dto: SendCaseEmailDto): Promise<SendCaseEmailResult> {
    const to = uniqueAddresses(dto.to);
    const cc = uniqueAddresses(dto.cc ?? []).filter((address) => !to.some((t) => t.toLowerCase() === address.toLowerCase()));
    const subject = dto.subject.trim();
    const body = dto.body.trim();
    if (to.length === 0) throw new BadRequestException('ต้องมีผู้รับอย่างน้อย 1 คน');
    if (to.length + cc.length > MAX_RECIPIENTS) {
      throw new BadRequestException(`ผู้รับรวม (ถึง + สำเนา) ได้ไม่เกิน ${MAX_RECIPIENTS} คน`);
    }
    if (!subject || !body) throw new BadRequestException('กรุณาใส่หัวเรื่องและเนื้อหา');

    const connection = await this.connections.findActiveForUser(user.id);
    if (!connection) {
      throw new BadRequestException('ยังไม่ได้เชื่อมต่อ Microsoft 365 — เชื่อมต่อในหน้าตั้งค่าก่อนส่งอีเมล');
    }

    // Load and size-check every file BEFORE any Graph call, so a refused file never leaves a half-built draft in Outlook.
    const source = dto.replyToMessageId ? await this.loadReplySource(caseId, dto.replyToMessageId) : null;
    const attachments = await this.loadAttachments(caseId, dto.documentIds ?? []);
    const accessToken = await this.connections.getValidAccessToken(connection.id);
    const mail: OutgoingMail = { to, cc, subject, html: textToHtml(body) };

    let draft: GraphMessage;
    let mode: SendMode;
    try {
      ({ draft, mode } = await this.createDraft(accessToken, mail, connection.id, source, dto.replyAll ?? false));
      for (const { file } of attachments) {
        await this.graph.addFileAttachment(accessToken, draft.id, file);
      }
      await this.graph.sendDraft(accessToken, draft.id);
    } catch (error) {
      if (error instanceof GraphApiError && error.status === 401) {
        try {
          await this.connections.markError(connection.id, MailboxConnectionStatus.EXPIRED, 'Graph rejected the token while sending');
        } catch {
          // best effort — the user still gets the reconnect message below
        }
      }
      this.logger.warn(`Case ${caseId}: sending email via connection ${connection.id} failed: ${error}`);
      if (error instanceof GraphApiError && (error.status === 401 || error.status === 403)) {
        throw new BadRequestException('Microsoft ไม่อนุญาตให้ส่งอีเมลจากบัญชีนี้ — กรุณาเชื่อมต่อ Microsoft 365 ใหม่ในหน้าตั้งค่า');
      }
      throw new BadRequestException('ส่งอีเมลไม่สำเร็จ — ถ้ามีร่างค้างในโฟลเดอร์ Drafts ของ Outlook ลบหรือส่งจาก Outlook ได้');
    }

    // Microsoft has the mail now. Nothing below may turn this into an error — a 500 here invites a second send.
    let threadId: string | null = null;
    try {
      // ponytail: caseId only sticks to a thread not unlinked by a sync rule (caseUnlinkedAt); NEW/REPLY_AS_NEW create a fresh thread, REPLY's thread is already on this case.
      const recorded = await this.sync.upsertGraphMessage({
        firmId: user.firmId,
        connectionId: connection.id,
        accessToken,
        message: {
          ...draft,
          from: { emailAddress: { name: `${user.firstName} ${user.lastName}`.trim(), address: connection.mailboxAddress } },
          toRecipients: recipients(to),
          ccRecipients: recipients(cc),
          body: draft.body ?? { contentType: 'html', content: mail.html },
          receivedDateTime: new Date().toISOString(),
          // ponytail: outbound attachments are case Documents already — not stored a second time as EmailAttachment.
          hasAttachments: false,
        },
        direction: 'OUTBOUND',
        caseId,
        createThreadIfMissing: true,
      });
      threadId = recorded?.threadId ?? null;
    } catch (error) {
      this.logger.error(`Case ${caseId}: email ${draft.internetMessageId} was sent but recording it failed: ${error}`);
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: CASE_EMAIL_SENT,
          metadata: {
            caseId,
            threadId,
            mode,
            from: connection.mailboxAddress,
            to,
            cc,
            subject,
            documentIds: attachments.map((a) => a.documentId),
            replyToMessageId: dto.replyToMessageId ?? null,
            clientRequestId: dto.clientRequestId ?? null,
          },
        },
      });
    } catch (error) {
      this.logger.error(`Case ${caseId}: email sent but audit log write failed: ${error}`);
    }

    return { mode, threadId, recorded: threadId !== null };
  }

  /**
   * Real Outlook reply only when the source sits in THIS connection's mailbox
   * (`/me` is that mailbox) — otherwise, or when Graph lost the message, a new
   * message from my own mailbox that the caller files under the same case.
   */
  private async createDraft(
    accessToken: string,
    mail: OutgoingMail,
    connectionId: string,
    source: ReplySource | null,
    replyAll: boolean,
  ): Promise<{ draft: GraphMessage; mode: SendMode }> {
    if (source?.graphMessageId && source.thread.mailboxConnectionId === connectionId) {
      try {
        const reply = await this.graph.createReplyDraft(accessToken, source.graphMessageId, replyAll);
        const draft = await this.graph.updateDraft(accessToken, reply.id, {
          subject: mail.subject,
          body: { contentType: 'HTML', content: prependToHtml(reply.body?.content, mail.html) },
          toRecipients: recipients(mail.to),
          ccRecipients: recipients(mail.cc),
        });
        return { draft, mode: 'REPLY' };
      } catch (error) {
        if (!(error instanceof GraphApiError && error.status === 404)) throw error;
        this.logger.warn(`Reply source ${source.id} is gone from the mailbox — sending as a new message`);
      }
    }

    const draft = await this.graph.createDraftMessage(accessToken, {
      subject: mail.subject,
      body: { contentType: 'HTML', content: mail.html },
      toRecipients: recipients(mail.to),
      ccRecipients: recipients(mail.cc),
    });
    return { draft, mode: source ? 'REPLY_AS_NEW' : 'NEW' };
  }

  /** The source must be in a thread filed under THIS case — the route's CaseAccessGuard is what authorises it. */
  private async loadReplySource(caseId: string, messageId: string): Promise<ReplySource> {
    const source = await this.prisma.emailMessage.findFirst({
      where: { id: messageId, thread: { caseId } },
      select: { id: true, graphMessageId: true, thread: { select: { mailboxConnectionId: true } } },
    });
    if (!source) throw new NotFoundException('ไม่พบอีเมลต้นทางในคดีนี้');
    return source;
  }

  private async loadAttachments(caseId: string, documentIds: string[]): Promise<LoadedAttachment[]> {
    const ids = [...new Set(documentIds)];
    if (ids.length === 0) return [];
    const documents = await this.prisma.document.findMany({
      where: { id: { in: ids }, caseId, storagePath: { not: '' } },
      select: { id: true, filename: true, mimeType: true, storagePath: true },
    });
    if (documents.length !== ids.length) throw new NotFoundException('ไม่พบเอกสารบางรายการในคดีนี้');

    const loaded: LoadedAttachment[] = [];
    let total = 0;
    for (const document of documents) {
      const buffer = await this.fileStorage
        .getBuffer(document.storagePath)
        .catch(() => {
          throw new NotFoundException(`อ่านไฟล์ "${document.filename}" ไม่ได้ — ไฟล์อาจถูกลบหรือเสียหาย`);
        });
      if (buffer.length > MAX_ATTACHMENT_BYTES) {
        throw new BadRequestException(`ไฟล์ "${document.filename}" ใหญ่เกิน 3 MB แนบตรงไม่ได้ — ใช้ลิงก์ OneDrive แทน`);
      }
      total += buffer.length;
      if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
        throw new BadRequestException('ไฟล์แนบรวมเกิน 15 MB — ส่งบางไฟล์เป็นลิงก์ OneDrive แทน');
      }
      loaded.push({
        documentId: document.id,
        file: { name: document.filename, contentType: document.mimeType, contentBytes: buffer.toString('base64') },
      });
    }
    return loaded;
  }
}
