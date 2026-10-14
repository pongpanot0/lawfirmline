import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, DocumentCategory } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { DocumentsService } from '../documents/documents.service';
import { EmailThreadStatus, Prisma } from '../generated/prisma';
import { awaitingMessage, loadInternalAddresses, loadLatestMessages } from './awaiting-reply';
import { MATCHABLE_CASE_SELECT, suggestCaseMatches, toMatchableCase } from '../outlook-integration/case-matching';

export type ThreadMatchReason = 'CONTACT_EMAIL' | 'OWN_REF' | 'CASE_NUMBER';

export interface ThreadCaseSuggestion {
  caseId: string;
  ownRef: string;
  title: string;
  reasons: ThreadMatchReason[];
}

const THREAD_REASON_RANK: Record<ThreadMatchReason, number> = { OWN_REF: 0, CASE_NUMBER: 1, CONTACT_EMAIL: 2 };
const MAX_SUGGESTIONS = 10;
const MAX_ADDRESSES = 20;
const MAX_CASE_THREADS = 200;

/**
 * Email ↔ case: manual thread linking (with exact-rule suggestions — no AI,
 * a person always confirms) and the case "อีเมล" tab. Every read goes through
 * getEmailThreadFilterForUser, so a thread is only visible here when the
 * Phase 0 visibility rule already allows it.
 */
@Injectable()
export class CaseEmailService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private documents: DocumentsService,
    private fileStorage: FileStorageService,
  ) {}

  private async threadWhere(user: AuthUser, extra: Prisma.EmailThreadWhereInput): Promise<Prisma.EmailThreadWhereInput> {
    return { AND: [await this.caseAccess.getEmailThreadFilterForUser(user), extra] };
  }

  private audit(user: AuthUser, action: 'EMAIL_THREAD_LINKED' | 'EMAIL_THREAD_UNLINKED' | 'EMAIL_REPLY_DISMISSED' | 'EMAIL_REPLY_UNDISMISSED', metadata: Record<string, string>) {
    return this.prisma.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action, metadata } });
  }

  async suggestCasesForThread(user: AuthUser, threadId: string): Promise<ThreadCaseSuggestion[]> {
    const thread = await this.prisma.emailThread.findFirst({
      where: await this.threadWhere(user, { id: threadId }),
      select: {
        subject: true,
        fromAddress: true,
        mailboxConnection: { select: { mailboxAddress: true } },
        messages: { select: { fromAddress: true, toAddresses: true, ccAddresses: true } },
      },
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้');

    const ownMailbox = thread.mailboxConnection?.mailboxAddress.toLowerCase();
    const addresses = [
      ...new Set(
        [thread.fromAddress, ...thread.messages.flatMap((m) => [m.fromAddress, ...m.toAddresses, ...m.ccAddresses])]
          .map((address) => address?.trim().toLowerCase() ?? '')
          .filter((address) => address && address !== ownMailbox),
      ),
    ].slice(0, MAX_ADDRESSES);

    const caseFilter = this.caseAccess.getCaseFilterForUser(user);
    const emailIs = addresses.map((address) => ({ email: { equals: address, mode: 'insensitive' as const } }));
    const [contactCases, allCases] = await Promise.all([
      addresses.length
        ? this.prisma.case.findMany({
            where: {
              AND: [
                caseFilter,
                {
                  OR: [
                    { client: { OR: addresses.map((a) => ({ billingEmail: { equals: a, mode: 'insensitive' as const } })) } },
                    { client: { contacts: { some: { OR: emailIs } } } },
                    { participants: { some: { OR: emailIs } } },
                  ],
                },
              ],
            },
            select: { id: true, ownRef: true, title: true },
            take: MAX_SUGGESTIONS,
          })
        : Promise.resolve([] as { id: string; ownRef: string; title: string }[]),
      this.prisma.case.findMany({ where: caseFilter, select: MATCHABLE_CASE_SELECT }),
    ]);

    const byCase = new Map<string, ThreadCaseSuggestion>();
    const add = (c: { id: string; ownRef: string; title: string }, reason: ThreadMatchReason) => {
      const entry = byCase.get(c.id) ?? { caseId: c.id, ownRef: c.ownRef, title: c.title, reasons: [] };
      if (!entry.reasons.includes(reason)) entry.reasons.push(reason);
      byCase.set(c.id, entry);
    };
    for (const match of suggestCaseMatches(thread.subject, allCases.map(toMatchableCase))) {
      if (match.reason === 'CLIENT_NAME') continue; // names in subjects are too noisy — sender/recipient emails cover the client
      add({ id: match.caseId, ownRef: match.ownRef, title: match.title }, match.reason);
    }
    for (const c of contactCases) add(c, 'CONTACT_EMAIL');

    const best = (s: ThreadCaseSuggestion) => Math.min(...s.reasons.map((r) => THREAD_REASON_RANK[r]));
    return [...byCase.values()]
      .sort((a, b) => b.reasons.length - a.reasons.length || best(a) - best(b) || a.ownRef.localeCompare(b.ownRef))
      .slice(0, MAX_SUGGESTIONS);
  }

  async linkThread(user: AuthUser, threadId: string, caseId: string): Promise<{ threadId: string; caseId: string }> {
    const thread = await this.prisma.emailThread.findFirst({
      where: await this.threadWhere(user, { id: threadId }),
      select: { id: true, caseId: true, intakeId: true },
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้');
    if (thread.caseId === caseId) return { threadId: thread.id, caseId };
    if (thread.caseId) throw new ConflictException('อีเมลนี้ผูกกับคดีอื่นอยู่แล้ว — ยกเลิกการผูกเดิมก่อน');
    if (!(await this.caseAccess.canAccessCase(user, caseId))) {
      throw new NotFoundException('ไม่พบคดี หรือคุณไม่มีสิทธิ์ในคดีนี้');
    }

    // Guarded write: a concurrent link to another case loses instead of silently overwriting.
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: thread.id, caseId: null },
      data: { caseId, status: EmailThreadStatus.LINKED, caseUnlinkedAt: null },
    });
    if (count === 0) throw new ConflictException('อีเมลนี้ผูกกับคดีอื่นอยู่แล้ว — ยกเลิกการผูกเดิมก่อน');
    await this.audit(user, 'EMAIL_THREAD_LINKED', { threadId: thread.id, caseId });
    return { threadId: thread.id, caseId };
  }

  async unlinkThread(user: AuthUser, threadId: string): Promise<{ unlinked: boolean }> {
    const thread = await this.prisma.emailThread.findFirst({
      where: await this.threadWhere(user, { id: threadId }),
      select: { id: true, caseId: true, intakeId: true },
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้');
    if (!thread.caseId) return { unlinked: false };
    if (!(await this.caseAccess.canAccessCase(user, thread.caseId))) {
      throw new ForbiddenException('ยกเลิกการผูกได้เฉพาะผู้ที่มีสิทธิ์ในคดีนี้');
    }

    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: {
        caseId: null,
        caseUnlinkedAt: new Date(),
        status: thread.intakeId ? EmailThreadStatus.LINKED : EmailThreadStatus.PENDING_INTAKE,
      },
    });
    await this.audit(user, 'EMAIL_THREAD_UNLINKED', { threadId: thread.id, caseId: thread.caseId });
    return { unlinked: true };
  }

  async listCaseThreads(user: AuthUser, caseId: string) {
    const threads = await this.prisma.emailThread.findMany({
      where: await this.threadWhere(user, { caseId }),
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        lastMessageAt: true,
        replyDismissedAt: true,
        messages: { select: { _count: { select: { attachments: true } } } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: MAX_CASE_THREADS,
    });
    const [internal, latest] = await Promise.all([
      loadInternalAddresses(this.prisma, user.firmId),
      loadLatestMessages(this.prisma, threads.map((t) => t.id)),
    ]);
    return threads.map((thread) => ({
      id: thread.id,
      awaitingReplySince: awaitingMessage(thread, latest.get(thread.id), internal)?.receivedAt.toISOString() ?? null,
      subject: thread.subject,
      fromName: thread.fromName,
      fromAddress: thread.fromAddress,
      lastMessageAt: thread.lastMessageAt,
      messageCount: thread.messages.length,
      attachmentCount: thread.messages.reduce((sum, m) => sum + m._count.attachments, 0),
    }));
  }

  /** "ไม่ต้องตอบ" (dismiss=true) or undo it. */
  async setReplyDismissed(user: AuthUser, caseId: string, threadId: string, dismiss: boolean) {
    const thread = await this.prisma.emailThread.findFirst({
      where: await this.threadWhere(user, { id: threadId, caseId }),
      select: { id: true },
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้ในคดี');
    await this.prisma.emailThread.update({ where: { id: thread.id }, data: { replyDismissedAt: dismiss ? new Date() : null } });
    await this.audit(user, dismiss ? 'EMAIL_REPLY_DISMISSED' : 'EMAIL_REPLY_UNDISMISSED', { threadId: thread.id, caseId });
    return { dismissed: dismiss };
  }

  async getCaseThread(user: AuthUser, caseId: string, threadId: string) {
    const thread = await this.prisma.emailThread.findFirst({
      where: await this.threadWhere(user, { id: threadId, caseId }),
      select: {
        id: true,
        subject: true,
        caseId: true,
        lastMessageAt: true,
        messages: {
          orderBy: { receivedAt: 'asc' },
          select: {
            id: true,
            direction: true,
            fromName: true,
            fromAddress: true,
            toAddresses: true,
            ccAddresses: true,
            bodyText: true,
            bodyHtml: true,
            receivedAt: true,
            attachments: {
              orderBy: { createdAt: 'asc' },
              select: { id: true, filename: true, mimeType: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้ในคดี');
    return thread;
  }

  // ponytail: per-process guard — use an advisory lock if the api runs multiple instances
  private readonly saving = new Map<string, Promise<{ document: { id: string; filename: string }; alreadySaved: boolean }>>();

  /** "บันทึกไฟล์แนบเข้าเอกสารคดี" — idempotent per attachment via a tag, so a double click saves once. */
  saveAttachmentToCase(user: AuthUser, caseId: string, attachmentId: string) {
    const key = `${caseId}:${attachmentId}`;
    const inFlight = this.saving.get(key);
    if (inFlight) return inFlight;
    const run = this.doSaveAttachment(user, caseId, attachmentId).finally(() => this.saving.delete(key));
    this.saving.set(key, run);
    return run;
  }

  private async doSaveAttachment(user: AuthUser, caseId: string, attachmentId: string) {
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: { id: attachmentId, message: { thread: await this.threadWhere(user, { caseId }) } },
      select: { id: true, filename: true, mimeType: true, storagePath: true },
    });
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบนี้ในคดี');

    const tag = `email-attachment:${attachment.id}`;
    const existing = await this.prisma.document.findFirst({
      // storagePath '' = a half-created row from a failed upload — not a real document, save again
      where: { caseId, tags: { has: tag }, storagePath: { not: '' } },
      select: { id: true, filename: true },
    });
    if (existing) return { document: existing, alreadySaved: true };

    const buffer = await this.fileStorage.getBuffer(attachment.storagePath);
    const document = await this.documents.createFromBuffer(user, caseId, {
      filename: attachment.filename,
      buffer,
      mimeType: attachment.mimeType,
      category: DocumentCategory.CORRESPONDENCE,
      tags: ['อีเมล', tag],
    });
    return { document: { id: document.id, filename: document.filename }, alreadySaved: false };
  }
}
