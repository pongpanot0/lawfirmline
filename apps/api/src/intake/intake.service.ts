import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser, redactForAi, AI_CREDIT_COST, AI_UPLOAD_MAX_BYTES } from '@lawfirm/shared';
import * as fs from 'fs';
import * as path from 'path';
import { AssignmentType, ReferralChannel } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { DocumentsService } from '../documents/documents.service';
import {
  CreateIntakeDto,
  UpdateIntakeDto,
  AssessIntakeDto,
  DecideIntakeDto,
  NoticeDto,
  ConvertToCaseDto,
  IntakeQueryDto,
  IntakeDecision,
  PreLitigationStatus,
} from './dto/intake.dto';
import { ConvertPortalSubmissionDto } from './dto/portal-submission.dto';

export const DRAFT_NOTICE_COST = AI_CREDIT_COST.DRAFT_NOTICE;
const MAX_ATTACHMENT_SIZE_BYTES = AI_UPLOAD_MAX_BYTES;

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    private prisma: PrismaService,
    private tasksService: TasksService,
    private config: ConfigService,
    private precedentAnalysisService: IntakePrecedentAnalysisService,
    private documentsService: DocumentsService,
  ) {}

  private intakeInclude = {
    receivedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    assessor: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    client: { select: { id: true, name: true } },
    case: { select: { id: true, ownRef: true, title: true, status: true } },
    relatedCase: { select: { id: true, ownRef: true, title: true, status: true } },
    attachments: {
      orderBy: { createdAt: 'desc' as const },
      select: { id: true, filename: true, mimeType: true, createdAt: true },
    },
    fieldProposals: {
      orderBy: { createdAt: 'desc' as const },
    },
    emailThreads: {
      select: { id: true, subject: true, fromName: true, fromAddress: true, lastMessageAt: true },
    },
  };

  async findAll(user: AuthUser, query: IntakeQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { firmId: user.firmId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { clientName: { contains: term, mode: 'insensitive' } },
        { referralName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.intake.findMany({
        where,
        include: this.intakeInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.intake.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(user: AuthUser, id: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id, firmId: user.firmId },
      include: this.intakeInclude,
    });
    if (!intake) throw new NotFoundException('Intake not found');
    return intake;
  }

  async create(user: AuthUser, dto: CreateIntakeDto) {
    if (dto.relatedCaseId) {
      const relatedCase = await this.prisma.case.findFirst({
        where: { id: dto.relatedCaseId, firmId: user.firmId },
      });
      if (!relatedCase) {
        throw new BadRequestException('ไม่พบคดีที่เลือกไว้ในสำนักงานนี้');
      }
    }
    return this.prisma.intake.create({
      data: {
        firmId: user.firmId,
        receivedById: user.id,
        receivedDate: new Date(dto.receivedDate),
        title: dto.title,
        referralType: dto.referralType as string | undefined as any,
        referralChannel: dto.referralChannel as string | undefined as any,
        referralName: dto.referralName,
        clientId: dto.clientId,
        clientName: dto.clientName,
        matterType: dto.matterType,
        opposingParty: dto.opposingParty,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        description: dto.description,
        estimatedDamage: dto.estimatedDamage,
        assignedUserIds: dto.assignedUserIds ?? [],
        deadlineDate: dto.deadlineDate ? new Date(dto.deadlineDate) : undefined,
        relatedCaseId: dto.relatedCaseId,
        isOngoingElsewhere: dto.isOngoingElsewhere ?? false,
        externalCaseNumber: dto.externalCaseNumber,
        currentStageNote: dto.currentStageNote,
        preLitigationType: dto.preLitigationType as any,
        preLitigationStatus: dto.preLitigationStatus as any,
        preLitigationNotes: dto.preLitigationNotes,
        settlementOfferAmount: dto.settlementOfferAmount,
      },
      include: this.intakeInclude,
    });
  }

  /**
   * Editing a field the intake pipeline proposed and the lawyer already
   * confirmed resets that confirmation so the UI can surface the new value
   * as needing review again — confirmation stays advisory, not a hard gate.
   */
  private async resetConfirmationForEditedFields(id: string, dto: UpdateIntakeDto) {
    const editedFields: string[] = [];
    if (dto.estimatedDamage !== undefined) editedFields.push('estimatedDamage');
    if (dto.requestedResponseDate !== undefined) editedFields.push('requestedResponseDate');
    if (editedFields.length === 0) return;

    await this.prisma.intakeFieldProposal.updateMany({
      where: { intakeId: id, field: { in: editedFields }, status: 'CONFIRMED' as any },
      data: { status: 'REQUIRES_CONFIRMATION' as any, confirmedById: null, confirmedAt: null },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateIntakeDto) {
    await this.findOne(user, id);
    if (dto.relatedCaseId) {
      const relatedCase = await this.prisma.case.findFirst({
        where: { id: dto.relatedCaseId, firmId: user.firmId },
      });
      if (!relatedCase) {
        throw new BadRequestException('ไม่พบคดีที่เลือกไว้ในสำนักงานนี้');
      }
    }
    await this.resetConfirmationForEditedFields(id, dto);
    return this.prisma.intake.update({
      where: { id },
      data: {
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
        title: dto.title,
        referralType: dto.referralType as any,
        referralChannel: dto.referralChannel as any,
        referralName: dto.referralName,
        clientId: dto.clientId,
        clientName: dto.clientName,
        contactName: dto.contactName,
        matterType: dto.matterType,
        opposingParty: dto.opposingParty,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        description: dto.description,
        estimatedDamage: dto.estimatedDamage,
        requestedResponseDate: dto.requestedResponseDate ? new Date(dto.requestedResponseDate) : undefined,
        assessmentNotes: dto.assessmentNotes,
        caseStrength: dto.caseStrength,
        decision: dto.decision as any,
        decisionNotes: dto.decisionNotes,
        clientDecision: dto.clientDecision,
        noticeRecipient: dto.noticeRecipient,
        noticeDeadline: dto.noticeDeadline ? new Date(dto.noticeDeadline) : undefined,
        noticeResult: dto.noticeResult,
        relatedCaseId: dto.relatedCaseId,
        isOngoingElsewhere: dto.isOngoingElsewhere,
        externalCaseNumber: dto.externalCaseNumber,
        currentStageNote: dto.currentStageNote,
        preLitigationType: dto.preLitigationType as any,
        preLitigationStatus: dto.preLitigationStatus as any,
        preLitigationNotes: dto.preLitigationNotes,
        settlementOfferAmount: dto.settlementOfferAmount,
      },
      include: this.intakeInclude,
    });
  }

  /**
   * Record assessment notes / case strength and move the intake into ASSESSING.
   * Field proposals stay advisory — unconfirmed system suggestions do not block
   * the lawyer from proceeding.
   */
  async assess(user: AuthUser, id: string, dto: AssessIntakeDto) {
    await this.findOne(user, id);
    return this.prisma.intake.update({
      where: { id },
      data: {
        assessorId: dto.assessorId ?? user.id,
        assessedAt: new Date(),
        status: 'ASSESSING' as any,
        assessmentNotes: dto.assessmentNotes,
        caseStrength: dto.caseStrength,
      },
      include: this.intakeInclude,
    });
  }

  async decide(user: AuthUser, id: string, dto: DecideIntakeDto) {
    await this.findOne(user, id);

    const acceptedDecisions: IntakeDecision[] = [
      IntakeDecision.FILE_SUIT,
      IntakeDecision.NEGOTIATE_FIRST,
      IntakeDecision.SEND_NOTICE,
      IntakeDecision.COMPLAIN_TO_AUTHORITY,
    ];
    const status =
      dto.decision === IntakeDecision.CONSULTATION_ONLY
        ? 'CONSULTED'
        : acceptedDecisions.includes(dto.decision)
          ? 'ACCEPTED'
          : 'REJECTED';

    return this.prisma.intake.update({
      where: { id },
      data: {
        decidedAt: new Date(),
        status: status as any,
        decision: dto.decision as any,
        decisionNotes: dto.decisionNotes,
        clientDecision: dto.clientDecision,
      },
      include: this.intakeInclude,
    });
  }

  async issueNotice(user: AuthUser, id: string, dto: NoticeDto) {
    const existing = await this.findOne(user, id);

    if (dto.noticeContent && !dto.noticeContentReviewed) {
      throw new BadRequestException(
        'กรุณายืนยันว่าตรวจสอบเนื้อหาหนังสือแล้วก่อนบันทึก',
      );
    }

    const updated = await this.prisma.intake.update({
      where: { id },
      data: {
        noticeIssuedAt: new Date(),
        noticeRecipient: dto.noticeRecipient,
        noticeDeadline: dto.noticeDeadline ? new Date(dto.noticeDeadline) : undefined,
        noticeResult: dto.noticeResult,
        noticeContent: dto.noticeContent,
        preLitigationStatus:
          existing.preLitigationStatus === PreLitigationStatus.NOT_STARTED
            ? (PreLitigationStatus.NOTICE_SENT as any)
            : undefined,
      },
      include: this.intakeInclude,
    });

    // Only the first time notice is issued for this intake, add a personal
    // follow-up reminder — avoids duplicate tasks if the notice is edited later.
    if (!existing.noticeIssuedAt && dto.noticeDeadline) {
      await this.tasksService.create(user, null, {
        title: `ติดตามผล Notice: ${updated.title || updated.clientName || updated.client?.name || ''}`.trim(),
        assigneeId: user.id,
        dueDate: dto.noticeDeadline,
      });
    }

    return updated;
  }

  async draftNotice(user: AuthUser, id: string, analysisId?: string) {
    const intake = await this.findOne(user, id);

    let facts: string;
    if (analysisId) {
      const analysis = await this.precedentAnalysisService.getOne(user, id, analysisId);
      // A FAILED/PENDING analysis has an empty noticeFacts — drafting from it would
      // produce garbage while still charging AI credits. Throwing here also keeps
      // the credit interceptor from charging, since it only decrements on success.
      if (analysis.status !== 'COMPLETE') {
        throw new BadRequestException(
          'ผลการวิเคราะห์นี้ยังไม่สำเร็จ ไม่สามารถใช้ร่างหนังสือได้',
        );
      }
      facts = analysis.noticeFacts;
    } else {
      facts = [
        `ชื่อลูกความ (ผู้ส่งหนังสือ): ${intake.clientName || intake.client?.name || '(ไม่ระบุ)'}`,
        `คู่กรณี (ผู้รับหนังสือ): ${intake.opposingParty || '(ไม่ระบุ)'}`,
        `ประเภทเรื่อง: ${intake.matterType || '(ไม่ระบุ)'}`,
        intake.description ? `รายละเอียดเหตุการณ์: ${intake.description}` : null,
        intake.estimatedDamage ? `มูลค่าความเสียหายโดยประมาณ: ${intake.estimatedDamage} บาท` : null,
        intake.deadlineDate
          ? `กำหนดให้ตอบกลับ/ดำเนินการภายใน: ${intake.deadlineDate.toISOString().slice(0, 10)}`
          : null,
      ]
        .filter(Boolean)
        .join('\n');
    }

    const content = await this.generateNoticeDraft(facts);

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'intake.notice.draft',
        metadata: { intakeId: id, analysisId: analysisId ?? null },
      },
    });

    return { content };
  }

  private async generateNoticeDraft(rawFacts: string): Promise<string> {
    // The fallback branch above builds these facts straight from the intake, so
    // an ID or phone typed into the description would otherwise travel with the
    // prompt. The lawyer fills the real details into the letter afterwards.
    const facts = redactForAi(rawFacts).text;
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      return `[ร่างตัวอย่าง — ตั้งค่า OPENAI_API_KEY เพื่อให้ AI ร่างจริง]\n\nหนังสือบอกกล่าว\n\n${facts}\n\n(โปรดตรวจสอบและแก้ไขก่อนส่ง)`;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'คุณเป็นทนายความไทย ช่วยร่างหนังสือบอกกล่าว/ทวงถามที่เป็นทางการจากข้อเท็จจริงที่ให้มา ใช้ภาษากฎหมายไทยที่สุภาพและเป็นทางการ ระบุข้อเรียกร้องและกำหนดเวลาให้ชัดเจน ห้ามแต่งข้อเท็จจริงเพิ่มเติมนอกเหนือจากที่ให้มา นี่เป็นเพียงร่างสำหรับให้ทนายความตรวจสอบและแก้ไขก่อนส่งจริง',
          },
          { role: 'user', content: facts },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      this.logger.error(`OpenAI error: ${res.status}`);
      throw new Error('AI notice drafting failed');
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async convertToCase(user: AuthUser, id: string, dto: ConvertToCaseDto) {
    const intake = await this.findOne(user, id);

    // A second press — or a retry after a response was lost — must not open a
    // second case, nor add the deadline event and the intake task twice. The
    // case this intake already reached is the answer.
    if (intake.case) {
      return this.prisma.case.findUnique({ where: { id: intake.case.id } });
    }
    if (intake.status === 'CONVERTED' && intake.relatedCaseId) {
      return this.prisma.case.findUnique({ where: { id: intake.relatedCaseId } });
    }

    if (intake.relatedCaseId) {
      return this.attachToExistingCase(user, intake, dto);
    }

    // Generate ownRef like cases.service.ts
    const firm = await this.prisma.firm.findUnique({
      where: { id: user.firmId },
      select: { ownRefPrefix: true },
    });
    const prefix = (firm?.ownRefPrefix || 'TSBREF').toUpperCase();
    const year = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
    }).format(new Date());
    const yearKey = `${prefix}${year}`;

    const existing = await this.prisma.case.findMany({
      where: { firmId: user.firmId, ownRef: { startsWith: yearKey } },
      select: { ownRef: true },
    });

    const pattern = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${year}(\\d+)$`,
    );
    let maxSeq = 0;
    for (const row of existing) {
      const match = row.ownRef.match(pattern);
      if (!match) continue;
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
    const ownRef = `${prefix}${year}${String(maxSeq + 1).padStart(4, '0')}`;

    const folderId = `LF-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const title =
      dto.title ||
      intake.title ||
      (intake.clientName && intake.matterType
        ? `${intake.clientName} - ${intake.matterType}`
        : intake.clientName || 'คดีจาก Intake');

    const newCase = await this.prisma.case.create({
      data: {
        firmId: user.firmId,
        ownRef,
        folderId,
        title,
        description: this.buildCaseDescription(intake),
        clientId: intake.clientId ?? undefined,
        clientName: intake.clientName ?? undefined,
        referralSource: intake.referralName ?? undefined,
        status: 'OPEN' as any,
        leadLawyerId: dto.leadLawyerId ?? user.id,
        intakeId: intake.id,
        limitationDeadline: intake.deadlineDate ?? undefined,
        caseTypeId: dto.caseTypeId ?? undefined,
        // Only what the lawyer confirmed. The intake's estimated damage is a
        // different figure and never becomes the amount claimed by itself.
        claimedAmount: dto.claimedAmount ?? undefined,
      },
    });

    // Carry the intake's whole precedent-analysis history forward onto the case
    // so it stays visible after conversion.
    await this.prisma.intakePrecedentAnalysis.updateMany({
      where: { intakeId: intake.id },
      data: { caseId: newCase.id },
    });

    await this.carryFilesOntoCase(intake.id, newCase.id);

    await this.prisma.intake.update({
      where: { id },
      data: { status: 'CONVERTED' as any },
    });

    const assigneeIds = (intake.assignedUserIds ?? []).filter(
      (userId) => userId !== newCase.leadLawyerId,
    );
    if (assigneeIds.length > 0) {
      await this.prisma.caseAssignment.createMany({
        data: assigneeIds.map((userId) => ({
          caseId: newCase.id,
          userId,
          assignmentType: AssignmentType.BUDDY,
        })),
        skipDuplicates: true,
      });
    }

    if (intake.deadlineDate) {
      await this.prisma.calendarEvent.create({
        data: {
          caseId: newCase.id,
          title: `ครบกำหนด: ${newCase.title}`,
          startAt: intake.deadlineDate,
          type: 'DEADLINE' as any,
        },
      });
    }

    await this.tasksService.create(user, newCase.id, {
      title: `เริ่มดำเนินการคดี: ${newCase.title}`,
      assigneeId: newCase.leadLawyerId,
      dueDate: intake.deadlineDate?.toISOString(),
    });

    return newCase;
  }

  private buildCaseDescription(intake: {
    description?: string | null;
    isOngoingElsewhere?: boolean;
    externalCaseNumber?: string | null;
    currentStageNote?: string | null;
  }): string | undefined {
    const parts = [intake.description ?? undefined];
    if (intake.isOngoingElsewhere) {
      parts.push(
        [
          'คดีนี้ดำเนินอยู่แล้วที่อื่นก่อนเข้าสำนักงาน:',
          intake.externalCaseNumber ? `เลขคดี/หมายเลขดำ: ${intake.externalCaseNumber}` : null,
          intake.currentStageNote ? `สถานะปัจจุบัน: ${intake.currentStageNote}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    const combined = parts.filter(Boolean).join('\n\n');
    return combined || undefined;
  }

  private async attachToExistingCase(
    user: AuthUser,
    intake: {
      id: string;
      firmId: string;
      relatedCaseId: string | null;
      assignedUserIds: string[];
      deadlineDate: Date | null;
      title: string | null;
      matterType: string | null;
    },
    dto: ConvertToCaseDto,
  ) {
    const relatedCase = await this.prisma.case.findFirst({
      where: { id: intake.relatedCaseId!, firmId: user.firmId },
    });
    if (!relatedCase) {
      throw new BadRequestException('ไม่พบคดีที่เลือกไว้ในสำนักงานนี้');
    }

    const updatedCase = await this.prisma.case.update({
      where: { id: relatedCase.id },
      data: {
        limitationDeadline: relatedCase.limitationDeadline ?? intake.deadlineDate ?? undefined,
      },
    });

    await this.prisma.intakePrecedentAnalysis.updateMany({
      where: { intakeId: intake.id },
      data: { caseId: relatedCase.id },
    });

    await this.carryFilesOntoCase(intake.id, relatedCase.id);

    await this.prisma.intake.update({
      where: { id: intake.id },
      data: { status: 'CONVERTED' as any },
    });

    const assigneeIds = (intake.assignedUserIds ?? []).filter(
      (userId) => userId !== relatedCase.leadLawyerId,
    );
    if (assigneeIds.length > 0) {
      await this.prisma.caseAssignment.createMany({
        data: assigneeIds.map((userId) => ({
          caseId: relatedCase.id,
          userId,
          assignmentType: AssignmentType.BUDDY,
        })),
        skipDuplicates: true,
      });
    }

    if (intake.deadlineDate) {
      await this.prisma.calendarEvent.create({
        data: {
          caseId: relatedCase.id,
          title: `ครบกำหนด: ${updatedCase.title}`,
          startAt: intake.deadlineDate,
          type: 'DEADLINE' as any,
        },
      });
    }

    await this.tasksService.create(user, relatedCase.id, {
      title: `เรื่องใหม่จาก Intake: ${intake.title ?? intake.matterType ?? 'ไม่ระบุ'}`,
      assigneeId: relatedCase.leadLawyerId,
      dueDate: intake.deadlineDate?.toISOString(),
    });

    return updatedCase;
  }

  /**
   * Move the intake's files onto the case.
   *
   * Files the lawyer uploaded for the AI to read live in the older
   * `IntakeAttachment` store, which has no link to a case — so they used to
   * disappear from view the moment the intake became one. They are adopted as
   * documents first, then every document is re-pointed at the case.
   */
  private async carryFilesOntoCase(intakeId: string, caseId: string) {
    await this.documentsService.adoptIntakeAttachments(intakeId, caseId);
    await this.prisma.document.updateMany({
      where: { intakeId },
      data: { caseId, intakeId: null },
    });
  }

  async listPortalSubmissions(user: AuthUser) {
    return this.prisma.portalIntakeSubmission.findMany({
      where: { client: { firmId: user.firmId }, intakeId: null, withdrawnByClient: false },
      include: {
        clientContact: { select: { name: true, email: true } },
        client: { select: { name: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  async convertPortalSubmission(
    user: AuthUser,
    submissionId: string,
    dto: ConvertPortalSubmissionDto,
  ) {
    const submission = await this.prisma.portalIntakeSubmission.findFirst({
      where: { id: submissionId, client: { firmId: user.firmId } },
    });
    if (!submission) {
      throw new NotFoundException('ไม่พบเรื่องที่ส่งจาก Portal นี้');
    }
    if (submission.intakeId) {
      throw new BadRequestException('เรื่องนี้ถูกรับเข้าระบบไปแล้ว');
    }

    const intake = await this.prisma.intake.create({
      data: {
        firmId: user.firmId,
        receivedById: user.id,
        receivedDate: new Date(),
        title: submission.title,
        description: submission.detail,
        referralChannel: ReferralChannel.PORTAL,
        clientId: submission.clientId,
        deadlineDate: dto.officePlannedDate ? new Date(dto.officePlannedDate) : undefined,
        portalSubmissionId: submission.id,
      },
    });

    await this.prisma.portalIntakeSubmission.update({
      where: { id: submission.id },
      data: { intakeId: intake.id },
    });

    return intake;
  }

  private getUploadDir() {
    return this.config.get<string>('UPLOAD_DIR') ?? './uploads';
  }

  async uploadAttachment(user: AuthUser, intakeId: string, file: Express.Multer.File) {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
    });
    if (!intake) throw new NotFoundException('Intake not found');

    if (!file) {
      throw new BadRequestException('กรุณาแนบไฟล์');
    }
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('รองรับเฉพาะไฟล์ PDF เท่านั้น');
    }
    // Unreachable via the HTTP route today — Multer's own `limits.fileSize` (see
    // the controller's FileInterceptor config) rejects an oversized upload first.
    // Kept as defense-in-depth for any future direct/non-HTTP caller of this method.
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException('ไฟล์มีขนาดใหญ่เกิน 10MB');
    }

    const uploadDir = path.join(this.getUploadDir(), 'intake', intakeId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = path.join(uploadDir, `${fileId}.pdf`);
    fs.writeFileSync(storagePath, file.buffer);

    return this.prisma.intakeAttachment.create({
      data: {
        intakeId,
        filename: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        uploadedById: user.id,
      },
    });
  }

  async deleteAttachment(user: AuthUser, intakeId: string, attachmentId: string) {
    const attachment = await this.prisma.intakeAttachment.findFirst({
      where: { id: attachmentId, intakeId },
      include: { intake: { select: { firmId: true } } },
    });
    if (!attachment || attachment.intake.firmId !== user.firmId) {
      throw new NotFoundException('Attachment not found');
    }

    // The file on disk may already be gone (manual cleanup, a prior partial
    // failure, a DB restored without its files). Never let that block removing
    // the DB row, or the attachment becomes permanently un-deletable.
    try {
      fs.unlinkSync(attachment.storagePath);
    } catch (err) {
      this.logger.warn(
        `Failed to remove attachment file ${attachment.storagePath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await this.prisma.intakeAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }
}
