import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
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
  requestedResponseDate: 'requestedResponseDate',
};

const threadInclude = {
  intake: {
    select: { id: true, status: true, title: true, clientName: true },
  },
  messages: {
    orderBy: { receivedAt: 'desc' as const },
    include: {
      attachments: true,
    },
  },
};

@Injectable()
export class EmailIntakeService {
  constructor(private prisma: PrismaService) {}

  async listThreads(user: AuthUser) {
    const threads = await this.prisma.emailThread.findMany({
      where: { firmId: user.firmId },
      include: {
        intake: { select: { id: true, status: true } },
        messages: {
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { id: true, bodyText: true, attachments: { select: { id: true } } },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return threads.map((thread) => ({
      id: thread.id,
      subject: thread.subject,
      fromName: thread.fromName,
      fromAddress: thread.fromAddress,
      lastMessageAt: thread.lastMessageAt,
      status: thread.status,
      messageCount: thread._count.messages,
      attachmentCount: thread.messages[0]?.attachments.length ?? 0,
      bodyExcerpt: thread.messages[0]?.bodyText?.slice(0, 200) ?? '',
      linkedIntake: thread.intake,
    }));
  }

  private async getThreadOrThrow(user: AuthUser, threadId: string) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, firmId: user.firmId },
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

    const latestMessage = thread.messages[0];
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
        description: latestMessage?.bodyText?.slice(0, 2000),
        status: IntakeStatus.RECEIVED,
        relatedCaseId: dto.relatedCaseId,
      },
    });

    await this.prisma.emailThread.update({
      where: { id: thread.id },
      data: { intakeId: intake.id, status: EmailThreadStatus.LINKED },
    });

    if (latestMessage) {
      await this.generateProposalsForMessage(intake.id, latestMessage.id, latestMessage.bodyText ?? '');
    }

    return this.prisma.intake.findUnique({ where: { id: intake.id } });
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
    const intake = await this.prisma.intake.findFirst({ where: { id: intakeId, firmId: user.firmId } });
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
   * Accepting the intake ("รับเข้าพิจารณา") requires every field the system
   * marked as needing confirmation to have been resolved first — matching
   * the required-confirmation gate from the brief.
   */
  async assertReadyForAcceptance(intakeId: string) {
    const outstanding = await this.prisma.intakeFieldProposal.count({
      where: { intakeId, status: FieldProposalStatus.REQUIRES_CONFIRMATION },
    });
    if (outstanding > 0) {
      throw new BadRequestException('ยังมีข้อมูลที่ต้องยืนยันก่อนรับเรื่อง');
    }
  }

  /**
   * A new inbound message on an already-linked thread. Detected changes are
   * proposed as new field-proposal rows — they never overwrite an existing
   * CONFIRMED value; the lawyer applies (or skips) each one individually via
   * `resolveFieldProposal`.
   */
  async recordReply(user: AuthUser, threadId: string, dto: SeedMockReplyDto) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { id: threadId, firmId: user.firmId },
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
