import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser, redactForAi, splitQuotedText } from '@lawfirm/shared';
import { INTAKE_AI_RESPONSE_FORMAT, INTAKE_AI_SYSTEM_PROMPT, parseIntakeAiResult } from './email-intake-ai';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import {
  EmailDirection,
  EmailThreadStatus,
  FieldProposalSourceType,
  FieldProposalStatus,
  IntakeStatus,
} from '../generated/prisma';
import { extractFieldsFromEmailBody } from './field-extraction.util';
import { AcceptIntakeFromThreadDto, ResolveFieldProposalDto, SeedMockReplyDto } from './dto/email-intake.dto';

/**
 * Maps a field-proposal `field` key to the Intake column it feeds.
 * `null` means the field is display-only (e.g. contact name has no direct
 * home yet) and confirmation only marks the proposal, without writing back.
 */
const INTAKE_FIELD_MAP: Record<string, string | null> = {
  title: 'title',
  clientName: 'clientName',
  contactName: 'contactName',
  opposingParty: 'opposingParty',
  description: 'description',
  estimatedDamage: 'estimatedDamage',
  // Display-only until Intake has columns for them; the lawyer still sees each amount and its wording.
  insurerPaidAmount: null,
  otherAmount: null,
  requestedResponseDate: 'requestedResponseDate',
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

    return threads.map((thread) => {
      const excerpt = excerptByThread.get(thread.id);
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

    return { thread, proposals };
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
      // cannot create a second Intake for the same thread.
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

    const intake = await this.prisma.intake.create({
      data: {
        firmId: user.firmId,
        receivedById: user.id,
        receivedDate: thread.lastMessageAt,
        title: thread.subject,
        referralChannel: 'EMAIL',
        clientId: clientMatch?.id,
        clientName: clientMatch?.name ?? thread.fromName,
        contactName: thread.fromName,
        description: latestMessage?.bodyText ? splitQuotedText(latestMessage.bodyText).main.slice(0, 2000) : undefined,
        status: IntakeStatus.RECEIVED,
        relatedCaseId: dto.relatedCaseId,
      },
    });

    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: { intakeId: intake.id, status: EmailThreadStatus.LINKED },
    });

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
    await this.proposeFromThread(intakeId, thread.messages);
    return { threadId, intakeId };
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
      .map((m) => ({ id: m.id, text: redactForAi(splitQuotedText(m.bodyText ?? '').main.slice(0, 4000)).text }))
      .filter((m) => m.text.trim());
    if (!messages.length) throw new BadRequestException('ไม่มีเนื้อหาอีเมลให้ AI อ่าน');

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('ยังไม่ได้ตั้งค่า AI');
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
            { role: 'user', content: JSON.stringify({ subject: redactForAi(thread.subject).text, messages }) },
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

    const proposals = parseIntakeAiResult(content, messages);
    if (proposals.length) {
      await this.prisma.intakeFieldProposal.createMany({
        data: proposals.map((p) => ({
          intakeId: thread.intake!.id,
          field: p.field,
          proposedValue: p.value,
          sourceType: FieldProposalSourceType.EMAIL_BODY,
          sourceDetail: p.sourceDetail,
          sourceEmailMessageId: p.sourceMessageId,
          status: FieldProposalStatus.REQUIRES_CONFIRMATION,
        })),
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

    const proposal = await this.prisma.intakeFieldProposal.findFirst({
      where: { id: proposalId, intakeId },
    });
    if (!proposal) throw new NotFoundException('ไม่พบข้อมูลที่เสนอ');
    if (proposal.status === FieldProposalStatus.CONFIRMED || proposal.status === FieldProposalStatus.REJECTED) {
      return proposal;
    }

    if (dto.action === 'reject') {
      return this.prisma.intakeFieldProposal.update({
        where: { id: proposalId },
        data: { status: FieldProposalStatus.REJECTED },
      });
    }

    const finalValue = dto.overrideValue ?? proposal.proposedValue ?? '';
    const updated = await this.prisma.intakeFieldProposal.update({
      where: { id: proposalId },
      data: {
        status: FieldProposalStatus.CONFIRMED,
        proposedValue: finalValue,
        confirmedById: user.id,
        confirmedAt: new Date(),
      },
    });

    const column = INTAKE_FIELD_MAP[proposal.field];
    if (column) {
      const data: Record<string, unknown> = {};
      if (column === 'estimatedDamage') {
        data[column] = Number(finalValue);
      } else if (column === 'requestedResponseDate') {
        data[column] = new Date(finalValue);
      } else {
        data[column] = finalValue;
      }
      await this.prisma.intake.update({ where: { id: intakeId }, data });
    }

    return updated;
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
