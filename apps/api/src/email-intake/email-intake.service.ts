import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { extname } from 'path';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { intakeProgress } from './email-intake-progress';
import { ConfigService } from '@nestjs/config';
import { AuthUser, redactForAi, splitQuotedText, stripEmailSignature } from '@lawfirm/shared';
import { INTAKE_AI_RESPONSE_FORMAT, INTAKE_AI_SYSTEM_PROMPT, parseIntakeAiResult } from './email-intake-ai';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import {
  DocumentCategory,
  EmailDirection,
  EmailThreadStatus,
  FieldProposalSourceType,
  FieldProposalStatus,
  IntakeStatus,
} from '../generated/prisma';
import { extractFieldsFromEmailBody, parseIntakeDate } from './field-extraction.util';
import { AcceptIntakeFromThreadDto, ResolveFieldProposalDto, SeedMockReplyDto } from './dto/email-intake.dto';

/** Another request linked the thread while this one was creating its intake. */
const LINKED_MEANWHILE = new Error('thread linked meanwhile');

const INTAKE_FIELD_MAP: Record<string, string> = {
  title: 'title', clientName: 'clientName', contactName: 'contactName', opposingParty: 'opposingParty',
  description: 'description', insurerName: 'insurerName', policyNumber: 'policyNumber', claimNumber: 'claimNumber',
  estimatedDamage: 'estimatedDamage', insurerPaidAmount: 'insurerPaidAmount', settlementOfferAmount: 'settlementOfferAmount',
  incidentDate: 'incidentDate', requestedResponseDate: 'requestedResponseDate',
};

const threadInclude = {
  intake: {
    select: { id: true, status: true, title: true, clientName: true },
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
const ACCEPT_MESSAGES_LIMIT = 10;

@Injectable()
export class EmailIntakeService {
  private readonly logger = new Logger(EmailIntakeService.name);

  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private config: ConfigService,
    private fileStorage: FileStorageService,
    private documentIntelligence: DocumentIntelligenceService,
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
    const proposals = thread.intake
      ? await this.prisma.intakeFieldProposal.findMany({
        where: { intakeId: thread.intake.id },
        orderBy: { createdAt: 'desc' },
      })
      : [];

    const documents = thread.intake ? await this.threadDocuments(thread.intake.id, thread.messages) : [];
    const aiRead = await this.prisma.auditLog.findFirst({
      where: { firmId: user.firmId, action: 'EMAIL_INTAKE_AI_EXTRACTED', metadata: { path: ['threadId'], equals: threadId } },
      select: { id: true },
    });
    return { thread, proposals, documents: documents.map(({ id, filename, mimeType, category }) => ({ id, filename, mimeType, category })),
      progress: intakeProgress(thread, proposals, thread.messages.some((m) => m.direction === EmailDirection.INBOUND && m.attachments.length > 0), !!aiRead) };
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
    const clientMatch = dto.clientId
      ? await this.prisma.client.findFirst({ where: { id: dto.clientId, firmId: user.firmId } })
      : await this.suggestClientMatch(user, thread.fromName);

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
        clientName: clientMatch?.name ?? thread.fromName,
        contactName: thread.fromName,
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
    if (!thread.fromAddress) return [];
    const intakeFilter = await this.caseAccess.getIntakeFilterForUser(user);
    return this.prisma.intake.findMany({
      where: {
        AND: [
          intakeFilter,
          { status: { notIn: [IntakeStatus.REJECTED, IntakeStatus.CONVERTED] } },
          { emailThreads: { some: { id: { not: thread.id }, fromAddress: { equals: thread.fromAddress, mode: 'insensitive' } } } },
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
    const messages = thread.messages
      .filter((m) => m.direction === EmailDirection.INBOUND)
      .slice(0, ACCEPT_MESSAGES_LIMIT)
      .reverse()
      .map((m) => ({ id: m.id, text: redactForAi(stripEmailSignature(splitQuotedText(m.bodyText ?? '').main).slice(0, 4000)).text }))
      .filter((m) => m.text.trim());

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่า AI');
    const files = (await this.threadDocuments(thread.intake.id, thread.messages)).slice(0, 5);
    const documents: { id: string; filename: string; text: string }[] = [];
    for (const file of files) {
      try {
        const buffer = await this.fileStorage.getBuffer(file.storagePath);
        const text = await this.documentIntelligence.extractTextWithOcr(buffer, file.mimeType, { documentId: file.id, firmId: user.firmId });
        documents.push({ id: file.id, filename: redactForAi(file.filename).text, text: redactForAi(text.slice(0, 3000)).text });
      } catch {
        this.logger.warn(`Email intake document extraction failed: ${file.id}`);
        documents.push({ id: file.id, filename: redactForAi(file.filename).text, text: '' });
      }
    }
    if (!messages.length && !documents.length) throw new BadRequestException('ไม่มีเนื้อหาอีเมลหรือไฟล์ให้ AI อ่าน');
    const documentRequests = await this.prisma.intakeDocumentRequest.findMany({ where: { intakeId: thread.intake.id }, select: { id: true, name: true } });
    const redactedRequests = documentRequests.map((request) => ({ id: request.id, name: redactForAi(request.name).text }));
    let content: string;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Tried 2026-11-09 on a two-matter Thai e-mail: luna split and labelled every amount as
          // well as 5.4-nano/5.4-mini at half nano's price. No `temperature` (GPT-5+ rejects it).
          model: INTAKE_AI_MODEL,
          response_format: INTAKE_AI_RESPONSE_FORMAT,
          messages: [
            { role: 'system', content: INTAKE_AI_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify({ subject: redactForAi(thread.subject).text, messages, documents, documentRequests: redactedRequests }) },
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

    const proposals = parseIntakeAiResult(content, messages, documents, redactedRequests);
    if (proposals.length) {
      await this.prisma.$transaction(async (tx) => {
      // A fresh read replaces what is still unreviewed from these messages and files: the keyword
      // guesses (same amounts, sometimes mislabelled) and any earlier AI read. Decided ones stay.
      await tx.intakeFieldProposal.deleteMany({
        where: {
          intakeId: thread.intake!.id,
          OR: [{ sourceEmailMessageId: { in: messages.map((m) => m.id) } }, { sourceDocumentId: { in: documents.map((d) => d.id) } }],
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
      data: { firmId: user.firmId, userId: user.id, action: 'EMAIL_INTAKE_AI_EXTRACTED', metadata: { threadId, intakeId: thread.intake.id, proposals: proposals.length } },
    });
    return { proposals: proposals.length };
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
        } else if (column === 'incidentDate' || column === 'requestedResponseDate') {
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
