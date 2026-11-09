import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { OutlookSyncService } from '../outlook-integration/outlook-sync.service';
import { hasCidRefs } from '../outlook-integration/mail/inline-cid-images';
import { extname } from 'path';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { intakeProgress } from './email-intake-progress';
import { ConfigService } from '@nestjs/config';
import { AuthUser, redactForAi, splitQuotedText, stripEmailSignature } from '@lawfirm/shared';
import { AiProposal, INTAKE_AI_RESPONSE_FORMAT, INTAKE_AI_SYSTEM_PROMPT, IntakeAiSummary, parseIntakeAiResult, parseIntakeAiSummary } from './email-intake-ai';
import { createHash } from 'crypto';

type AiReadResult = { summary: IntakeAiSummary | null; proposals: AiProposal[] };
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import {
  DocumentCategory,
  EmailDirection,
  EmailThreadStatus,
  FieldProposalSourceType,
  FieldProposalStatus,
  IntakeStatus,
  PartyRole,
} from '../generated/prisma';
import { extractFieldsFromEmailBody, parseIntakeDate } from './field-extraction.util';
import { AcceptIntakeFromThreadDto, LinkIntakeClientDto, ResolveFieldProposalDto, SeedMockReplyDto } from './dto/email-intake.dto';
import { loadInternalAddresses } from './awaiting-reply';
import { subjectRefs } from './case-email.service';

// Personal mailboxes say nothing about which organisation the sender belongs to.
const PUBLIC_MAIL_DOMAINS = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'yahoo.com', 'icloud.com', 'msn.com', 'hotmail.co.th', 'yahoo.co.th']);
const ORGANISATION_LINE = /hospital|clinic|company|co\.,?\s*ltd|limited|corporation|group|bank|insurance|บริษัท|โรงพยาบาล|คลินิก|ธนาคาร|ประกันภัย|ประกันชีวิต|สำนักงาน|มูลนิธิ|ห้างหุ้นส่วน/i;

const domainOf = (address: string) => address.split('@')[1] ?? '';

/** Firm staff — a member, a connected mailbox, or anyone on the firm's own mail domain — are never the client. */
export function internalMatcher(internal: Set<string>) {
  const domains = new Set([...internal].map(domainOf).filter((d) => d && !PUBLIC_MAIL_DOMAINS.has(d)));
  return (address: string) => {
    const a = address.trim().toLowerCase();
    return internal.has(a) || domains.has(domainOf(a));
  };
}

type PartyMessage = { fromName: string | null; fromAddress: string | null; toAddresses: string[]; ccAddresses: string[]; bodyText: string | null };

/**
 * Who outside the firm the thread is with: the newest outside sender (their signature names the
 * organisation), else the first outside recipient — a lawyer forwarding or replying is not the client.
 */
export function externalParty<M extends PartyMessage>(messages: M[], isInternal: (address: string) => boolean) {
  const sender = messages.find((m) => m.fromAddress && !isInternal(m.fromAddress));
  if (sender) return { address: sender.fromAddress!.trim(), name: sender.fromName, message: sender as M | null };
  const recipient = messages.flatMap((m) => [...m.toAddresses, ...m.ccAddresses]).find((a) => !isInternal(a));
  return recipient ? { address: recipient.trim(), name: null, message: null as M | null } : null;
}

/** Another request linked the thread while this one was creating its intake. */
const LINKED_MEANWHILE = new Error('thread linked meanwhile');

const INTAKE_FIELD_MAP: Record<string, string> = {
  title: 'title', clientName: 'clientName', contactName: 'contactName', opposingParty: 'opposingParty',
  description: 'description', insurerName: 'insurerName', policyNumber: 'policyNumber', claimNumber: 'claimNumber',
  estimatedDamage: 'estimatedDamage', insurerPaidAmount: 'insurerPaidAmount', settlementOfferAmount: 'settlementOfferAmount',
  incidentDate: 'incidentDate', requestedResponseDate: 'requestedResponseDate', deadlineDate: 'deadlineDate',
  matterType: 'matterType', customerRef: 'customerRef', externalCaseNumber: 'externalCaseNumber', partyRole: 'partyRole',
};

const threadInclude = {
  intake: {
    select: { id: true, status: true, title: true, clientName: true, case: { select: { id: true, ownRef: true, title: true } } },
  },
  case: {
    select: { id: true, ownRef: true, title: true },
  },
  messages: {
    orderBy: { receivedAt: 'desc' as const },
    include: {
      attachments: true,
    },
  },
};

const THREAD_LIST_LIMIT = 200;
const INTAKE_AI_MODEL = 'gpt-6-luna';
// Inbound messages read for proposals when a thread is accepted — the opening request often
// holds the amounts while the newest reply is just "ขอบคุณค่ะ".
const ACCEPT_MESSAGES_LIMIT = 20;
// A claim thread carries 8-10 files (report, claim form, medical records): read them all, with
// enough of each to reach past the cover page.
const AI_FILES_LIMIT = 12;
const AI_FILE_CHARS = 6000;
const OCR_CONCURRENCY = 3;
// ponytail: Outlook names pasted signature logos image001.png… — skipped by name; a real photo
// with that name is skipped too. Check size/content-id if that bites.
const INLINE_IMAGE = /^image\d{3}\.(png|jpe?g|gif)$/i;

@Injectable()
export class EmailIntakeService {
  private readonly logger = new Logger(EmailIntakeService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private config: ConfigService,
    private fileStorage: FileStorageService,
    private documentIntelligence: DocumentIntelligenceService,
    @Inject(forwardRef(() => OutlookSyncService)) private outlookSync: OutlookSyncService,
  ) {}

  async listThreads(user: AuthUser) {
    const accessWhere = await this.caseAccess.getEmailThreadFilterForUser(user);
    const threads = await this.prisma.emailThread.findMany({
      where: accessWhere,
      include: {
        intake: { select: { id: true, status: true } },
        mailboxConnection: { select: { mailboxAddress: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      // A synced Outlook mailbox holds tens of thousands of threads (22k on prod, a 12 MB
      // response). This is a work queue; older mail is found through e-mail search.
      take: THREAD_LIST_LIMIT,
    });
    if (threads.length === 0) return [];

    // One excerpt per thread, picked and trimmed in Postgres: the newest INBOUND message
    // (the client's words, not our reply), else the newest message. Prisma's `distinct`
    // and nested `take` run in memory, which pulled every synced e-mail body into the API
    // and starved the 2 GB host (prod hang, 2026-10-25). The id is picked first and the
    // body read only for that row: `left("bodyText")` in the DISTINCT ON select list runs
    // before the sort, which still read every body off disk and took minutes.
    const threadIds = threads.map((t) => t.id);
    const excerpts = await this.prisma.$queryRaw<{ id: string; threadId: string; excerpt: string | null }[]>`
      SELECT m."id", m."threadId", left(m."bodyText", 200) AS "excerpt"
      FROM (
        SELECT DISTINCT ON ("threadId") "id"
        FROM "EmailMessage"
        WHERE "threadId" = ANY(${threadIds}::text[])
        ORDER BY "threadId", ("direction" = 'INBOUND') DESC, "receivedAt" DESC
      ) latest
      JOIN "EmailMessage" m ON m."id" = latest."id"`;
    const attachmentCounts = await this.prisma.emailAttachment.groupBy({
      by: ['messageId'],
      where: { messageId: { in: excerpts.map((e) => e.id) } },
      _count: { _all: true },
    });
    const excerptByThread = new Map(excerpts.map((e) => [e.threadId, e]));
    const attachmentsByMessage = new Map(attachmentCounts.map((a) => [a.messageId, a._count._all]));

    const senders = [...new Set(threads.flatMap((t) => !t.intake && !t.caseId && t.fromAddress ? [t.fromAddress.toLowerCase()] : []))];
    const intakeFilter = await this.caseAccess.getIntakeFilterForUser(user);
    const candidates = senders.length ? await this.prisma.intake.findMany({
      where: { AND: [intakeFilter, { status: { notIn: [IntakeStatus.REJECTED, IntakeStatus.CONVERTED] } },
        { emailThreads: { some: { OR: senders.map((sender) => ({ fromAddress: { equals: sender, mode: 'insensitive' as const } })) } } }] },
      select: { id: true, title: true, emailThreads: { where: { OR: senders.map((sender) => ({ fromAddress: { equals: sender, mode: 'insensitive' as const } })) }, select: { fromAddress: true } } },
    }) : [];
    const candidatesBySender = new Map<string, Map<string, { id: string; title: string | null }>>();
    for (const candidate of candidates) for (const linkedThread of candidate.emailThreads) {
      if (!linkedThread.fromAddress) continue;
      const sender = linkedThread.fromAddress.toLowerCase();
      const matches = candidatesBySender.get(sender) ?? new Map();
      matches.set(candidate.id, { id: candidate.id, title: candidate.title });
      candidatesBySender.set(sender, matches);
    }

    return threads.map((thread) => {
      const excerpt = excerptByThread.get(thread.id);
      const matches = thread.fromAddress ? candidatesBySender.get(thread.fromAddress.toLowerCase()) : undefined;
      return {
        id: thread.id,
        subject: thread.subject,
        fromName: thread.fromName,
        fromAddress: thread.fromAddress,
        lastMessageAt: thread.lastMessageAt,
        status: thread.status,
        messageCount: thread._count.messages,
        attachmentCount: excerpt ? attachmentsByMessage.get(excerpt.id) ?? 0 : 0,
        bodyExcerpt: excerpt?.excerpt ?? '',
        linkedIntake: thread.intake,
        suggestedIntake: !thread.intake && !thread.caseId && matches?.size === 1 ? [...matches.values()][0] : null,
        caseId: thread.caseId,
        mailboxAddress: thread.mailboxConnection?.mailboxAddress ?? null,
      };
    });
  }

  async getAttachmentForDownload(user: AuthUser, attachmentId: string) {
    const thread = await this.caseAccess.getEmailThreadFilterForUser(user);
    const attachment = await this.prisma.emailAttachment.findFirst({
      where: { id: attachmentId, message: { thread } },
      select: { filename: true, mimeType: true, storagePath: true },
    });
    if (!attachment) throw new NotFoundException('ไม่พบไฟล์แนบ');
    return attachment;
  }

  private async getThreadOrThrow(user: AuthUser, threadId: string) {
    const accessWhere = await this.caseAccess.getEmailThreadFilterForUser(user);
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, ...accessWhere },
      include: threadInclude,
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้');
    if (thread.intake) {
      const intakeFilter = await this.caseAccess.getIntakeFilterForUser(user);
      const intake = await this.prisma.intake.findFirst({ where: { id: thread.intake.id, ...intakeFilter }, select: { id: true } });
      if (!intake) throw new NotFoundException('ไม่พบเรื่องนี้');
    }
    return thread;
  }

  async getThread(user: AuthUser, threadId: string) {
    const thread = await this.getThreadOrThrow(user, threadId);
    // Mail synced before inline images were embedded still points at cid: parts; repair on open.
    const connectionId = thread.mailboxConnectionId;
    if (connectionId) {
      thread.messages = await Promise.all(thread.messages.map(async (m) => (hasCidRefs(m.bodyHtml) && m.graphMessageId
        ? { ...m, bodyHtml: await this.outlookSync.inlineStoredImages({ id: m.id, graphMessageId: m.graphMessageId, bodyHtml: m.bodyHtml }, connectionId) }
        : m)));
    }
    const proposals = thread.intake
      ? await this.prisma.intakeFieldProposal.findMany({
        where: { intakeId: thread.intake.id },
        orderBy: { createdAt: 'desc' },
      })
      : [];

    const documents = thread.intake ? await this.threadDocuments(thread.intake.id, thread.messages) : [];
    const aiRead = await this.prisma.auditLog.findFirst({
      where: { firmId: user.firmId, action: 'EMAIL_INTAKE_AI_EXTRACTED', metadata: { path: ['threadId'], equals: threadId } },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const aiSummary = (aiRead?.metadata as { summary?: unknown } | null)?.summary ?? null;
    const clientMatch = thread.intake ? await this.clientMatchForThread(user, thread) : null;
    return { thread, proposals, aiSummary, clientMatch, documents: documents.map(({ id, filename, mimeType, category }) => ({ id, filename, mimeType, category })),
      progress: intakeProgress(thread, proposals, thread.messages.some((m) => m.direction === EmailDirection.INBOUND && m.attachments.length > 0), !!aiRead) };
  }

  /**
   * Who the client is: the intake's linked client, or existing clients that match the sender
   * (same e-mail on a contact, then same company domain, then a similar name), plus a name to
   * offer when none fits — the organisation line of the sender's signature, else the domain.
   */
  private async externalPartyOf<M extends PartyMessage>(user: AuthUser, messages: M[]) {
    return externalParty(messages, internalMatcher(await loadInternalAddresses(this.prisma, user.firmId)));
  }

  private async clientMatchForThread(user: AuthUser, thread: { intake: { id: string } | null; messages: PartyMessage[] }) {
    const intake = await this.prisma.intake.findUnique({ where: { id: thread.intake!.id }, select: { client: { select: { id: true, name: true } } } });
    const party = await this.externalPartyOf(user, thread.messages);
    const address = party?.address.toLowerCase() ?? '';
    const domain = address.includes('@') && !PUBLIC_MAIL_DOMAINS.has(domainOf(address)) ? domainOf(address) : null;
    const main = splitQuotedText(party?.message?.bodyText ?? '').main;
    const signature = main.slice(stripEmailSignature(main).length).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const organisation = [...signature].reverse().find((l) => ORGANISATION_LINE.test(l) && l.length <= 120);
    const domainWord = domain ? domain.split('.')[0] : null;
    const suggestedName = organisation ?? (domainWord ? domainWord.charAt(0).toUpperCase() + domainWord.slice(1) : party?.name ?? '');

    const candidates = new Map<string, { id: string; name: string; reason: 'EMAIL' | 'DOMAIN' | 'NAME' }>();
    const add = (rows: { id: string; name: string }[], reason: 'EMAIL' | 'DOMAIN' | 'NAME') => rows.forEach((c) => !candidates.has(c.id) && candidates.set(c.id, { ...c, reason }));
    const select = { id: true, name: true } as const;
    if (address) add(await this.prisma.client.findMany({ where: { firmId: user.firmId, contacts: { some: { email: { equals: address, mode: 'insensitive' } } } }, select, take: 5 }), 'EMAIL');
    if (domain) add(await this.prisma.client.findMany({ where: { firmId: user.firmId, OR: [
      { contacts: { some: { email: { endsWith: `@${domain}`, mode: 'insensitive' } } } }, { billingEmail: { endsWith: `@${domain}`, mode: 'insensitive' } }] }, select, take: 5 }), 'DOMAIN');
    const names = [organisation, domainWord && domainWord.length >= 4 ? domainWord : null].filter((n): n is string => !!n);
    if (names.length) add(await this.prisma.client.findMany({ where: { firmId: user.firmId, OR: names.map((n) => ({ name: { contains: n, mode: 'insensitive' as const } })) }, select, take: 5 }), 'NAME');
    return { linked: intake?.client ?? null, candidates: [...candidates.values()].filter((c) => c.id !== intake?.client?.id).slice(0, 5), suggestedName };
  }

  /** Link the intake to an existing client, or create the client (sender as its contact) and link it. */
  async linkClientForThread(user: AuthUser, threadId: string, dto: LinkIntakeClientDto) {
    const thread = await this.getThreadOrThrow(user, threadId);
    if (!thread.intake) throw new BadRequestException('รับอีเมลนี้เป็นเรื่องก่อน');
    if (!dto.clientId === !dto.name) throw new BadRequestException('เลือกลูกค้าเดิม หรือใส่ชื่อลูกค้าใหม่ อย่างใดอย่างหนึ่ง');
    const party = await this.externalPartyOf(user, thread.messages);
    const contact = party ? { name: party.name?.trim() || party.address, email: party.address, isPrimary: true } : null;
    const client = dto.clientId
      ? await this.prisma.client.findFirst({ where: { id: dto.clientId, firmId: user.firmId }, select: { id: true, name: true } })
      : await this.prisma.client.create({
        data: { firmId: user.firmId, name: dto.name!.trim(), contacts: contact ? { create: [contact] } : undefined },
        select: { id: true, name: true },
      });
    if (!client) throw new NotFoundException('ไม่พบลูกค้านี้');
    if (dto.clientId && contact) {
      // An existing client gains the sender as a contact, so the next e-mail from them matches directly.
      const known = await this.prisma.clientContact.count({ where: { clientId: client.id, email: { equals: contact.email, mode: 'insensitive' } } });
      if (!known) await this.prisma.clientContact.create({ data: { clientId: client.id, name: contact.name, email: contact.email, isPrimary: false } });
    }
    await this.prisma.intake.update({ where: { id: thread.intake.id }, data: { clientId: client.id, clientName: client.name } });
    await this.prisma.auditLog.create({ data: { firmId: user.firmId, userId: user.id, action: dto.clientId ? 'EMAIL_INTAKE_CLIENT_LINKED' : 'EMAIL_INTAKE_CLIENT_CREATED', metadata: { threadId, intakeId: thread.intake.id, clientId: client.id } } });
    return client;
  }

  /**
   * Suggest an existing client whose name matches the sender/thread text.
   * Ambiguous or no-match results are surfaced as-is — the lawyer decides.
   */
  private async suggestClientMatch(user: AuthUser, candidateName?: string | null) {
    if (!candidateName) return null;
    const matches = await this.prisma.client.findMany({
      where: {
        firmId: user.firmId,
        name: { contains: candidateName, mode: 'insensitive' },
      },
      select: { id: true, name: true },
      take: 5,
    });
    if (matches.length === 1) return matches[0];
    return null;
  }

  /**
   * Accept an inbound email thread into the intake pipeline as a
   * pre-litigation assessment case — this is explicitly NOT a decision to
   * litigate (see Intake.decision, defaulted to PENDING).
   */
  async acceptIntakeFromThread(user: AuthUser, threadId: string, dto: AcceptIntakeFromThreadDto) {
    const thread = await this.getThreadOrThrow(user, threadId);
    if (thread.intake) {
      // Idempotent: re-accepting an already-linked thread just returns it,
      // so a duplicate click (or a duplicate inbound webhook delivery)
      // cannot create a second Intake for the same thread. Files are not re-adopted here: one
      // the lawyer removed from the intake must stay removed.
      return this.prisma.intake.findUnique({ where: { id: thread.intake.id } });
    }

    // A related case must be one this person can open, not just any id.
    if (dto.relatedCaseId) {
      const related = await this.prisma.case.count({ where: { id: dto.relatedCaseId, ...this.caseAccess.getCaseFilterForUser(user) } });
      if (!related) throw new NotFoundException('ไม่พบคดีที่อ้างถึง');
    }

    // Newest INBOUND message (the client's words); fall back to the newest of any direction.
    const latestMessage = thread.messages.find((m) => m.direction === EmailDirection.INBOUND) ?? thread.messages[0];
    const party = await this.externalPartyOf(user, thread.messages);
    const clientMatch = dto.clientId
      ? await this.prisma.client.findFirst({ where: { id: dto.clientId, firmId: user.firmId } })
      : await this.suggestClientMatch(user, party?.name);

    // Create and link in one step, linking only if nobody else did meanwhile (double click,
    // two lawyers): the loser's intake rolls back instead of becoming an orphan.
    const intake = await this.prisma.$transaction(async (tx) => {
      const created = await tx.intake.create({
      data: {
        firmId: user.firmId,
        receivedById: user.id,
        receivedDate: thread.lastMessageAt,
        title: thread.subject,
        referralChannel: 'EMAIL',
        clientId: clientMatch?.id,
        clientName: clientMatch?.name ?? party?.name ?? null,
        contactName: party?.name ?? null,
        description: `${stripEmailSignature(splitQuotedText(latestMessage?.bodyText ?? '').main)}\n\n— ${latestMessage?.fromName ?? thread.fromName ?? ''} <${latestMessage?.fromAddress ?? thread.fromAddress ?? ''}>`.trim(),
        status: IntakeStatus.RECEIVED,
        relatedCaseId: dto.relatedCaseId,
      },
      });

      const { count } = await tx.emailThread.updateMany({
        where: { id: thread.id, intakeId: null },
        data: { intakeId: created.id, status: EmailThreadStatus.LINKED },
      });
      // Throwing rolls the new intake back; any other error propagates as before.
      if (!count) throw LINKED_MEANWHILE;
      return created;
    }).catch((err) => {
      if (err === LINKED_MEANWHILE) return null;
      throw err;
    });
    if (!intake) {
      const linked = await this.prisma.emailThread.findUnique({ where: { id: thread.id }, select: { intakeId: true } });
      return linked?.intakeId ? this.prisma.intake.findUnique({ where: { id: linked.intakeId } }) : null;
    }

    await this.copyThreadAttachments(user, intake.id, thread.messages);
    await this.proposeFromThread(intake.id, thread.messages);
    return this.prisma.intake.findUnique({ where: { id: intake.id } });
  }

  /**
   * Every inbound message, oldest first — one thread can hold more than one matter, and each
   * message's amounts are proposed with that message as their source.
   */
  private async proposeFromThread(intakeId: string, messages: { id: string; direction: EmailDirection; bodyText: string | null }[]) {
    const inbound = messages.filter((m) => m.direction === EmailDirection.INBOUND).slice(0, ACCEPT_MESSAGES_LIMIT);
    for (const message of (inbound.length ? inbound : messages.slice(0, 1)).reverse()) {
      await this.generateProposalsForMessage(intakeId, message.id, message.bodyText ?? '');
    }
  }

  /**
   * Clients often write a fresh e-mail instead of replying, which lands as a new thread. Offer the
   * open intakes this sender's other threads already belong to, so it joins that matter instead of
   * starting a duplicate. Only intakes this person can open; a converted one is a case — link that instead.
   */
  async suggestIntakesForThread(user: AuthUser, threadId: string) {
    const thread = await this.getThreadOrThrow(user, threadId);
    // Same matter = same sender, or the same claim/policy reference in another thread's subject or on the intake.
    const refs = subjectRefs(thread.subject);
    const sameMatter = [
      ...(thread.fromAddress ? [{ emailThreads: { some: { id: { not: thread.id }, fromAddress: { equals: thread.fromAddress, mode: 'insensitive' as const } } } }] : []),
      ...(refs.length ? [
        { emailThreads: { some: { id: { not: thread.id }, OR: refs.map((r) => ({ subject: { contains: r, mode: 'insensitive' as const } })) } } },
        { claimNumber: { in: refs } }, { policyNumber: { in: refs } },
      ] : []),
    ];
    if (!sameMatter.length) return [];
    const intakeFilter = await this.caseAccess.getIntakeFilterForUser(user);
    return this.prisma.intake.findMany({
      where: {
        AND: [
          intakeFilter,
          { status: { notIn: [IntakeStatus.REJECTED, IntakeStatus.CONVERTED] } },
          { OR: sameMatter },
        ],
      },
      select: { id: true, title: true, clientName: true, status: true, receivedDate: true },
      orderBy: { receivedDate: 'desc' },
      take: 5,
    });
  }

  /** Joins this thread to an existing intake; its messages are proposed like a reply would be. */
  async attachThreadToIntake(user: AuthUser, threadId: string, intakeId: string) {
    const thread = await this.getThreadOrThrow(user, threadId);
    if (thread.intake?.id === intakeId) return { threadId, intakeId };
    if (thread.intake) throw new BadRequestException('อีเมลนี้อยู่ในเรื่องอื่นแล้ว');
    const intakeFilter = await this.caseAccess.getIntakeFilterForUser(user);
    const intake = await this.prisma.intake.findFirst({ where: { id: intakeId, ...intakeFilter }, select: { id: true } });
    if (!intake) throw new NotFoundException('ไม่พบเรื่องนี้');
    // Conditional update: a concurrent accept on the same thread must not be overwritten.
    const { count } = await this.prisma.emailThread.updateMany({
      where: { id: thread.id, intakeId: null },
      data: { intakeId, status: EmailThreadStatus.LINKED },
    });
    if (!count) throw new BadRequestException('อีเมลนี้อยู่ในเรื่องอื่นแล้ว');
    await this.copyThreadAttachments(user, intakeId, thread.messages);
    await this.proposeFromThread(intakeId, thread.messages);
    return { threadId, intakeId };
  }

  private attachmentTags(messages: { direction: EmailDirection; attachments: { id: string }[] }[]) {
    return messages.filter((m) => m.direction === EmailDirection.INBOUND).flatMap((m) => m.attachments.map((a) => `email-attachment:${a.id}`));
  }

  private async threadDocuments(intakeId: string, messages: { direction: EmailDirection; attachments: { id: string }[] }[]) {
    const tags = this.attachmentTags(messages);
    return tags.length ? this.prisma.document.findMany({
      where: { intakeId, tags: { hasSome: tags } },
      select: { id: true, filename: true, mimeType: true, category: true, storagePath: true },
      orderBy: { createdAt: 'asc' },
    }) : [];
  }

  private async copyThreadAttachments(user: AuthUser, intakeId: string, messages: { direction: EmailDirection; attachments: { id: string; filename: string; mimeType: string; storagePath: string }[] }[]) {
    const attachments = messages.filter((m) => m.direction === EmailDirection.INBOUND).flatMap((m) => m.attachments);
    if (!attachments.length) return;
    await this.prisma.$transaction(async (tx) => {
      // Serialize copies for this intake so concurrent re-links cannot duplicate a tagged file.
      await tx.$queryRaw`SELECT "id" FROM "Intake" WHERE "id" = ${intakeId} FOR UPDATE`;
      const documents = await tx.document.findMany({ where: { intakeId, tags: { hasSome: attachments.map((a) => `email-attachment:${a.id}`) } }, select: { tags: true } });
      const copied = new Set(documents.flatMap((d) => d.tags));
      const data = attachments.filter((a) => !copied.has(`email-attachment:${a.id}`)).map((a) => ({
        intakeId, filename: a.filename, mimeType: a.mimeType, storagePath: a.storagePath,
        category: DocumentCategory.OTHER, tags: [`email-attachment:${a.id}`], uploadedById: user.id,
      }));
      if (data.length) await tx.document.createMany({ data });
    });
  }

  /**
   * "ให้ AI ช่วยอ่าน" — pressed by a person, never automatic. Reads the new text of each inbound
   * message (quotes stripped, identifiers redacted per ADR 0002) and adds proposals per matter;
   * the lawyer still confirms each one. Open proposals from an earlier pass are left as they are.
   */
  async aiExtract(user: AuthUser, threadId: string) {
    const thread = await this.getThreadOrThrow(user, threadId);
    if (!thread.intake) throw new BadRequestException('รับอีเมลนี้เข้าพิจารณาก่อน แล้วจึงให้ AI ช่วยอ่าน');
    const isInternal = internalMatcher(await loadInternalAddresses(this.prisma, user.firmId));
    const inbound = thread.messages.filter((m) => m.direction === EmailDirection.INBOUND).slice(0, ACCEPT_MESSAGES_LIMIT).reverse();
    const messages = inbound
      .map((m, i) => {
        const { main, quoted } = splitQuotedText(m.bodyText ?? '');
        const fromFirm = !!m.fromAddress && isInternal(m.fromAddress);
        // A forward's real content — and who the client is — sits in the quoted part: read it for the
        // oldest message and for the firm's own forwards (later replies only repeat it).
        const previous = (i === 0 || fromFirm) && quoted ? `\n\n[ข้อความก่อนหน้า]\n${quoted.slice(0, 4000)}` : '';
        return {
          id: m.id,
          fromFirm,
          text: redactForAi(`${stripEmailSignature(main).slice(0, 4000)}${previous}`).text,
        };
      })
      .filter((m) => m.text.trim());

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่า AI');
    const files = (await this.threadDocuments(thread.intake.id, thread.messages)).filter((f) => !INLINE_IMAGE.test(f.filename)).slice(0, AI_FILES_LIMIT);
    if (!messages.length && !files.length) throw new BadRequestException('ไม่มีเนื้อหาอีเมลหรือไฟล์ให้ AI อ่าน');
    const documentRequests = await this.prisma.intakeDocumentRequest.findMany({ where: { intakeId: thread.intake.id }, select: { id: true, name: true } });
    const redactedRequests = documentRequests.map((request) => ({ id: request.id, name: redactForAi(request.name).text }));
    const caseTypes = (await this.prisma.caseType.findMany({ where: { firmId: user.firmId, isActive: true }, select: { name: true } })).map((t) => t.name);

    // Same e-mails, files, requests and prompt as an earlier read → reuse its result: no OCR, no model call, no credit.
    const inputHash = createHash('sha256').update(JSON.stringify({
      model: INTAKE_AI_MODEL, prompt: INTAKE_AI_SYSTEM_PROMPT, format: INTAKE_AI_RESPONSE_FORMAT,
      subject: thread.subject, messages, files: files.map((f) => [f.id, f.storagePath]), redactedRequests, caseTypes,
    })).digest('hex');
    const earlier = await this.prisma.auditLog.findFirst({
      where: { firmId: user.firmId, action: 'EMAIL_INTAKE_AI_EXTRACTED', AND: [
        { metadata: { path: ['threadId'], equals: threadId } },
        { metadata: { path: ['inputHash'], equals: inputHash } },
      ] },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const cached = (earlier?.metadata as { result?: AiReadResult } | null)?.result ?? null;
    const { summary, proposals } = cached ?? await this.readWithAi(user, apiKey, thread.subject, messages, files, documentRequests, redactedRequests, caseTypes);
    if (proposals.length) {
      await this.prisma.$transaction(async (tx) => {
      // Two reads finishing together must not both insert: serialize on the intake row.
      await tx.$queryRaw`SELECT "id" FROM "Intake" WHERE "id" = ${thread.intake!.id} FOR UPDATE`;
      // A fresh read replaces what is still unreviewed from these messages and files: the keyword
      // guesses (same amounts, sometimes mislabelled) and any earlier AI read. Decided ones stay.
      await tx.intakeFieldProposal.deleteMany({
        where: {
          intakeId: thread.intake!.id,
          OR: [{ sourceEmailMessageId: { in: messages.map((m) => m.id) } }, { sourceDocumentId: { in: files.map((f) => f.id) } }],
          status: { in: [FieldProposalStatus.SUGGESTED, FieldProposalStatus.REQUIRES_CONFIRMATION] },
        },
      });
      await tx.intakeFieldProposal.createMany({
        data: proposals.map((p) => ({
          intakeId: thread.intake!.id,
          field: p.field,
          proposedValue: p.value,
          sourceType: p.sourceDocumentId ? FieldProposalSourceType.ATTACHMENT : FieldProposalSourceType.EMAIL_BODY,
          sourceDetail: p.sourceDetail,
          sourceEmailMessageId: p.sourceMessageId,
          sourceDocumentId: p.sourceDocumentId,
          matterLabel: p.matterLabel,
          status: FieldProposalStatus.REQUIRES_CONFIRMATION,
        })),
      });
      });
    }
    await this.prisma.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action: 'EMAIL_INTAKE_AI_EXTRACTED', metadata: JSON.parse(JSON.stringify({ threadId, intakeId: thread.intake.id, proposals: proposals.length, summary, inputHash, cached: !!cached, result: { summary, proposals } })) },
    });
    return { proposals: proposals.length, cached: !!cached };
  }

  /** OCR the files and ask the model; only evidence quoted from the redacted sources becomes a proposal. */
  private async readWithAi(
    user: AuthUser, apiKey: string, subject: string | null,
    messages: { id: string; fromFirm: boolean; text: string }[],
    files: { id: string; filename: string; mimeType: string; storagePath: string }[],
    documentRequests: { id: string; name: string }[],
    redactedRequests: { id: string; name: string }[],
    caseTypes: string[],
  ): Promise<AiReadResult> {
    const readFile = async (file: (typeof files)[number]) => {
      try {
        const buffer = await this.fileStorage.getBuffer(file.storagePath);
        const text = await this.documentIntelligence.extractTextWithOcr(buffer, file.mimeType, { documentId: file.id, firmId: user.firmId });
        return { id: file.id, filename: redactForAi(file.filename).text, text: redactForAi(text.slice(0, AI_FILE_CHARS)).text };
      } catch {
        this.logger.warn(`Email intake document extraction failed: ${file.id}`);
        return { id: file.id, filename: redactForAi(file.filename).text, text: '' };
      }
    };
    // A few at a time: twelve scans one by one would outlast the proxy, all at once would flood OCR.
    const documents: { id: string; filename: string; text: string }[] = [];
    for (let i = 0; i < files.length; i += OCR_CONCURRENCY) {
      documents.push(...await Promise.all(files.slice(i, i + OCR_CONCURRENCY).map(readFile)));
    }
    let content: string;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        // Up to twelve files plus the e-mails; a slow read is still stored, so a retry is served from cache.
        signal: AbortSignal.timeout(120000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Tried 2026-11-09 on a two-matter Thai e-mail: luna split and labelled every amount as
          // well as 5.4-nano/5.4-mini at half nano's price. No `temperature` (GPT-5+ rejects it).
          model: INTAKE_AI_MODEL,
          response_format: INTAKE_AI_RESPONSE_FORMAT,
          messages: [
            { role: 'system', content: INTAKE_AI_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify({ subject: redactForAi(subject).text, messages, documents, documentRequests: redactedRequests, caseTypes }) },
          ],
        }),
      });
      if (!response.ok) throw new Error(`provider ${response.status}`);
      const data = (await response.json()) as { choices?: Array<{ finish_reason?: string; message?: { content?: string; refusal?: string } }> };
      const choice = data.choices?.[0];
      if (choice?.message?.refusal || choice?.finish_reason === 'length' || !choice?.message?.content) throw new Error('incomplete');
      content = choice.message.content;
    } catch (err) {
      this.logger.warn(`Email intake AI failed: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException('AI อ่านอีเมลไม่สำเร็จ ลองใหม่ได้');
    }

    const summary = parseIntakeAiSummary(content);
    const requested = new Set(documentRequests.map((r) => r.name.trim()));
    // Documents the lawyer should ask for become one-click requests, never created on their own.
    const docRequests = (summary?.missingDocuments ?? []).filter((name) => !requested.has(name)).map((name) => ({
      field: 'docRequest', value: name, sourceMessageId: messages[messages.length - 1]?.id ?? null, sourceDocumentId: null,
      matterLabel: null, sourceDetail: 'AI แนะนำให้ขอเอกสารนี้จากลูกความ',
    }));
    return { summary, proposals: [...parseIntakeAiResult(content, messages, documents, redactedRequests, caseTypes), ...docRequests] };
  }

  private async generateProposalsForMessage(intakeId: string, messageId: string, bodyText: string) {
    const extracted = extractFieldsFromEmailBody(bodyText);
    if (extracted.length === 0) return;

    const currentValues = await this.prisma.intakeFieldProposal.findMany({
      where: { intakeId, field: { in: extracted.map((item) => item.field) }, status: FieldProposalStatus.CONFIRMED },
      orderBy: { confirmedAt: 'desc' },
    });
    const currentByField = new Map<string, string | null>();
    for (const value of currentValues) {
      if (!currentByField.has(value.field)) currentByField.set(value.field, value.proposedValue);
    }

    await this.prisma.intakeFieldProposal.createMany({
      data: extracted.map((item) => ({
        intakeId,
        field: item.field,
        proposedValue: item.value,
        previousValue: currentByField.get(item.field) ?? null,
        sourceType: FieldProposalSourceType.EMAIL_BODY,
        sourceDetail: item.sourceDetail,
        sourceEmailMessageId: messageId,
        status: FieldProposalStatus.REQUIRES_CONFIRMATION,
      })),
    });
  }

  /**
   * Resolve one proposed field. Confirming writes the value onto the Intake
   * record and marks the proposal CONFIRMED; it never touches a field the
   * lawyer already confirmed through a different proposal row — each edit to
   * a previously-confirmed field creates a new proposal instead (see
   * `applyReplyUpdate`), so history is preserved and nothing is overwritten
   * silently.
   */
  async resolveFieldProposal(
    user: AuthUser,
    intakeId: string,
    proposalId: string,
    dto: ResolveFieldProposalDto,
  ) {
    const intakeFilter = await this.caseAccess.getIntakeFilterForUser(user);
    const intake = await this.prisma.intake.findFirst({ where: { id: intakeId, ...intakeFilter } });
    if (!intake) throw new NotFoundException('ไม่พบเรื่องนี้');

    return this.prisma.$transaction(async (tx) => {
      // Lock before reading proposals/amounts: concurrent confirmations must append rather than overwrite.
      await tx.$queryRaw`SELECT "id" FROM "Intake" WHERE "id" = ${intakeId} FOR UPDATE`;
      const proposal = await tx.intakeFieldProposal.findFirst({ where: { id: proposalId, intakeId } });
      if (!proposal) throw new NotFoundException('ไม่พบข้อมูลที่เสนอ');
      if (proposal.status === FieldProposalStatus.CONFIRMED || proposal.status === FieldProposalStatus.REJECTED) return proposal;
      if (dto.action === 'reject') return tx.intakeFieldProposal.update({ where: { id: proposalId }, data: { status: FieldProposalStatus.REJECTED } });

      const finalValue = dto.overrideValue ?? proposal.proposedValue ?? '';
      const column = Object.prototype.hasOwnProperty.call(INTAKE_FIELD_MAP, proposal.field) ? INTAKE_FIELD_MAP[proposal.field] : undefined;
      const data: Record<string, unknown> = {};
      if (proposal.field === 'otherAmount') {
        let other: { label?: unknown; amount?: unknown } | null;
        try { other = JSON.parse(finalValue); } catch { throw new BadRequestException('ยอดเงินอื่นต้องมีชื่อและจำนวนเงิน'); }
        if (!other || typeof other.label !== 'string' || !other.label.trim() || typeof other.amount !== 'number'
          || !Number.isFinite(other.amount) || other.amount < 0) throw new BadRequestException('ยอดเงินอื่นต้องมีชื่อและจำนวนเงินที่ถูกต้อง');
        const current = await tx.intake.findFirst({ where: { id: intakeId, ...intakeFilter } });
        if (!current) throw new NotFoundException('ไม่พบเรื่องนี้');
        const amounts = Array.isArray(current.otherAmounts) ? current.otherAmounts : [];
        const entry = { label: other.label.trim(), amount: other.amount };
        if (!amounts.some((a) => a !== null && typeof a === 'object' && !Array.isArray(a) && a.label === entry.label && a.amount === entry.amount)) {
          data.otherAmounts = [...amounts, entry];
        }
      } else if (proposal.field === 'docRequest') {
        const name = finalValue.trim().slice(0, 200);
        if (!name) throw new BadRequestException('ชื่อเอกสารไม่ถูกต้อง');
        const exists = await tx.intakeDocumentRequest.findFirst({ where: { intakeId, name }, select: { id: true } });
        if (!exists) await tx.intakeDocumentRequest.create({ data: { intakeId, name, createdById: user.id } });
      } else if (proposal.field === 'caseType') {
        const caseType = await tx.caseType.findFirst({ where: { firmId: user.firmId, isActive: true, name: finalValue.trim() }, select: { id: true } });
        if (!caseType) throw new BadRequestException('ไม่พบประเภทคดีนี้ในสำนักงาน');
        data.caseTypeId = caseType.id;
      } else if (proposal.field === 'document') {
        let doc: { documentId?: unknown; category?: unknown; filename?: unknown; docRequestId?: unknown; docTypeLabel?: unknown } | null;
        try { doc = JSON.parse(finalValue); } catch { throw new BadRequestException('ข้อมูลเอกสารไม่ถูกต้อง'); }
        if (!doc || typeof doc.documentId !== 'string' || typeof doc.filename !== 'string' || !doc.filename.trim()
          || !Object.values(DocumentCategory).includes(doc.category as DocumentCategory)
          || (doc.docRequestId != null && typeof doc.docRequestId !== 'string')
          || (proposal.sourceDocumentId && proposal.sourceDocumentId !== doc.documentId)) throw new BadRequestException('ข้อมูลเอกสารไม่ถูกต้อง');
        const document = await tx.document.findFirst({ where: { id: doc.documentId, intakeId }, select: { id: true, filename: true } });
        if (!document) throw new NotFoundException('ไม่พบเอกสารในเรื่องนี้');
        if (doc.docRequestId) {
          const request = await tx.intakeDocumentRequest.findFirst({ where: { id: doc.docRequestId as string, intakeId }, select: { id: true } });
          if (!request) throw new NotFoundException('ไม่พบรายการเอกสารที่ขอในเรื่องนี้');
        }
        const originalExtension = extname(document.filename);
        const suggested = doc.filename.split(/[/\\]/).pop()!.replace(/[\x00-\x1f<>:"|?*]/g, '_').trim();
        const stem = (extname(suggested) ? suggested.slice(0, -extname(suggested).length) : suggested).replace(/[. ]+$/, '');
        if (!stem || stem === '.') throw new BadRequestException('ชื่อไฟล์ไม่ถูกต้อง');
        await tx.document.update({ where: { id: document.id }, data: { category: doc.category as DocumentCategory, filename: stem.slice(0, 240 - originalExtension.length) + originalExtension } });
        if (doc.docRequestId) await tx.intakeDocumentRequest.update({ where: { id: doc.docRequestId as string }, data: { documentId: document.id, status: 'RECEIVED', receivedAt: new Date() } });
      } else if (column) {
        // One e-mail can carry two matters but an intake has one value per field: never let the
        // second matter silently replace the first. Typing a value ("แก้ไข") is a deliberate choice.
        if (proposal.matterLabel && dto.overrideValue === undefined) {
          const other = await tx.intakeFieldProposal.findFirst({
            where: { intakeId, field: proposal.field, status: FieldProposalStatus.CONFIRMED, matterLabel: { not: proposal.matterLabel }, NOT: { matterLabel: null } },
            select: { matterLabel: true, proposedValue: true },
          });
          if (other && other.proposedValue !== finalValue) {
            throw new BadRequestException(`ช่องนี้ยืนยันค่าของเรื่อง "${other.matterLabel}" ไปแล้ว — อีเมลนี้มีหลายเรื่อง ถ้าจะใช้ค่านี้แทนให้กด "แก้ไข" แล้วบันทึก หรือกด "ไม่ใช่"`);
          }
        }
        if (['estimatedDamage', 'insurerPaidAmount', 'settlementOfferAmount'].includes(column)) {
          if (!finalValue.trim() || !Number.isFinite(Number(finalValue)) || Number(finalValue) < 0) throw new BadRequestException('จำนวนเงินไม่ถูกต้อง');
          data[column] = Number(finalValue);
        } else if (column === 'partyRole') {
          if (!Object.values(PartyRole).includes(finalValue as PartyRole)) throw new BadRequestException('บทบาทคู่ความไม่ถูกต้อง');
          data[column] = finalValue;
        } else if (column === 'incidentDate' || column === 'requestedResponseDate' || column === 'deadlineDate') {
          const date = parseIntakeDate(finalValue);
          if (!date) throw new BadRequestException('วันที่ไม่ถูกต้อง');
          data[column] = date;
        } else data[column] = finalValue;
      } else throw new BadRequestException('ไม่รองรับข้อมูลที่เสนอนี้');
      if (Object.keys(data).length) await tx.intake.update({ where: { id: intakeId }, data });
      return tx.intakeFieldProposal.update({
        where: { id: proposalId },
        data: { status: FieldProposalStatus.CONFIRMED, proposedValue: finalValue, confirmedById: user.id, confirmedAt: new Date() },
      });
    });
  }

  /**
   * A new inbound message on an already-linked thread. Detected changes are
   * proposed as new field-proposal rows — they never overwrite an existing
   * CONFIRMED value; the lawyer applies (or skips) each one individually via
   * `resolveFieldProposal`.
   */
  async recordReply(user: AuthUser, threadId: string, dto: SeedMockReplyDto) {
    const accessWhere = await this.caseAccess.getEmailThreadFilterForUser(user);
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, ...accessWhere },
    });
    if (!thread) throw new NotFoundException('ไม่พบอีเมลนี้');

    const message = await this.prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        messageKey: `mock-${Date.now()}`,
        direction: EmailDirection.INBOUND,
        fromName: dto.fromName ?? thread.fromName,
        fromAddress: dto.fromAddress ?? thread.fromAddress,
        bodyText: dto.bodyText,
        receivedAt: new Date(),
      },
    });

    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: message.receivedAt },
    });

    if (thread.intakeId) {
      await this.generateProposalsForMessage(thread.intakeId, message.id, dto.bodyText);
    }

    return this.prisma.emailMessage.findUnique({ where: { id: message.id }, include: { attachments: true } });
  }
}
