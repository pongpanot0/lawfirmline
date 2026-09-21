import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import { ConfigService } from '@nestjs/config';
import {
  ActivityType,
  AuthUser,
  DocRequestStatus,
  IntakeStage,
  redactForAi,
  AI_CREDIT_COST,
  AI_UPLOAD_MAX_BYTES,
  canAssignFirmRole,
  FirmRole,
} from '@lawfirm/shared';
import * as path from 'path';
import { AssignmentType, ReferralChannel } from '../generated/prisma';
import { INTAKE_STAGE_ORDER, preLitigationDocuments } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { DocumentsService } from '../documents/documents.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import {
  CreateIntakeDto,
  UpdateIntakeDto,
  AssessIntakeDto,
  DecideIntakeDto,
  NoticeDto,
  ConvertToCaseDto,
  IntakeQueryDto,
  IntakeStatus,
  IntakeDecision,
  CreateFollowUpDto,
  NoResponseDto,
  UpdateIntakeStageDto,
  CreateDocumentRequestDto,
  BulkCreateDocumentRequestsDto,
  UpdateDocumentRequestDto,
  PreLitigationStatus,
  CustomerShareDto,
  AdditionalClientDto,
} from './dto/intake.dto';
import { ConvertPortalSubmissionDto } from './dto/portal-submission.dto';

export const DRAFT_NOTICE_COST = AI_CREDIT_COST.DRAFT_NOTICE;
const MAX_ATTACHMENT_SIZE_BYTES = AI_UPLOAD_MAX_BYTES;

/** ค่าที่หน้าจอ checklist ใช้แทน "ได้รับแล้วแต่ไม่ผูกไฟล์" และ "ไม่เกี่ยวข้อง" */
const CHECKLIST_MANUAL = '__manual__';
const CHECKLIST_SKIPPED = '__skipped__';

@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    private prisma: PrismaService,
    private tasksService: TasksService,
    private config: ConfigService,
    private precedentAnalysisService: IntakePrecedentAnalysisService,
    private documentsService: DocumentsService,
    private fileStorage: FileStorageService,
    private caseAccess: CaseAccessService,
    private assignmentNotifier: AssignmentNotifierService,
    private conflictCheck: ConflictCheckService,
    private caseFeed: CaseFeedService,
  ) {}

  /** ลูกค้า = ผู้ว่าจ้าง/ผู้จ่าย; ถ้าไม่มีใครถูกตั้งเป็นหลัก ให้รายแรกเป็นหลัก */
  private customerRows(customers: CustomerShareDto[]) {
    const hasPrimary = customers.some((c) => c.isPrimary);
    return customers.map((c, index) => ({
      customerId: c.customerId,
      sharePercent: c.sharePercent ?? null,
      isPrimary: c.isPrimary ?? (!hasPrimary && index === 0),
      note: c.note ?? null,
    }));
  }

  /** ลูกความเพิ่มเติม (เกินคนที่ 1) — ลูกความหลักยังคงเป็น clientId */
  private additionalClientRows(clients: AdditionalClientDto[]) {
    return clients.map((c) => ({ clientId: c.clientId, note: c.note ?? null }));
  }

  private intakeInclude = {
    receivedBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    assessor: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    client: { select: { id: true, name: true } },
    customers: {
      orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
      select: {
        id: true,
        customerId: true,
        sharePercent: true,
        isPrimary: true,
        note: true,
        customer: { select: { id: true, name: true } },
      },
    },
    additionalClients: {
      orderBy: { createdAt: 'asc' as const },
      select: {
        id: true,
        clientId: true,
        note: true,
        client: { select: { id: true, name: true } },
      },
    },
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
    documentRequests: { orderBy: [{ required: 'desc' as const }, { requestedAt: 'asc' as const }] },
    followUps: {
      take: 10,
      orderBy: { createdAt: 'desc' as const },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    },
    conflictChecks: {
      take: 5,
      orderBy: { checkedAt: 'desc' as const },
      include: { checkedBy: { select: { firstName: true, lastName: true } } },
    },
  };

  async findAll(user: AuthUser, query: IntakeQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const accessWhere = await this.caseAccess.getIntakeFilterForUser(user);
    const where: Record<string, unknown> = { ...accessWhere };
    if (query.status) {
      where.status = query.status;
    }
    if (query.stage) {
      where.stage = query.stage;
    }
    if (query.followUpOwnerId) {
      where.followUpOwnerId = query.followUpOwnerId;
    }
    if (query.followUpOverdue) {
      // เรื่องที่ยังเปิดอยู่และ (นัดติดตามเลยกำหนด หรือไม่เคยนัดเลย)
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { status: { notIn: [IntakeStatus.CONVERTED, IntakeStatus.REJECTED] } },
        { OR: [{ nextFollowUpAt: { lte: new Date() } }, { nextFollowUpAt: null }] },
      ];
    }
    if (query.stalledDays) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { status: { notIn: [IntakeStatus.CONVERTED, IntakeStatus.REJECTED] } },
        { stageChangedAt: { lte: daysAgo(query.stalledDays) } },
      ];
    }
    if (query.search) {
      const term = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        {
          OR: [
            { title: { contains: term, mode: 'insensitive' } },
            { clientName: { contains: term, mode: 'insensitive' } },
            { referralName: { contains: term, mode: 'insensitive' } },
            { contactName: { contains: term, mode: 'insensitive' } },
            { opposingParty: { contains: term, mode: 'insensitive' } },
          ],
        },
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

    return { items: items.map(withAging), total, page, limit };
  }

  async findOne(user: AuthUser, id: string) {
    const accessWhere = await this.caseAccess.getIntakeFilterForUser(user);
    const intake = await this.prisma.intake.findFirst({
      where: { id, ...accessWhere },
      include: this.intakeInclude,
    });
    if (!intake) throw new NotFoundException('Intake not found');
    return intake;
  }

  /**
   * บันทึกการติดตามหนึ่งครั้ง แล้วเลื่อนนัดครั้งถัดไป
   *
   * lead ที่เงียบหายเพราะไม่มีใครถือ ไม่ใช่เพราะไม่มีใครอยากติดตาม —
   * ทุกครั้งที่ติดตามจึงต้องตอบให้ได้ว่า "ครั้งถัดไปเมื่อไร ใครถือ"
   */
  async addFollowUp(user: AuthUser, id: string, dto: CreateFollowUpDto) {
    await this.findOne(user, id);
    const now = new Date();
    const nextDueAt = dto.nextDueAt ? new Date(dto.nextDueAt) : null;

    const [followUp] = await this.prisma.$transaction([
      this.prisma.intakeFollowUp.create({
        data: {
          intakeId: id,
          note: dto.note,
          contacted: dto.contacted ?? true,
          nextDueAt,
          createdById: user.id,
        },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.intake.update({
        where: { id },
        data: {
          lastFollowUpAt: now,
          nextFollowUpAt: nextDueAt,
          followUpOwnerId: dto.nextOwnerId ?? undefined,
        },
      }),
    ]);

    return followUp;
  }

  /**
   * ย้ายขั้นตอนของงานรับเรื่อง
   *
   * ไม่บังคับให้เดินตามลำดับ — งานจริงถอยกลับได้ (ปรึกษาแล้วต้องขอเอกสารเพิ่ม)
   * แต่ทุกครั้งที่ย้าย ต้องรู้ว่าย้ายเมื่อไร เพื่อให้ aging ตอบได้ว่าค้างกี่วัน
   */
  async updateStage(user: AuthUser, id: string, dto: UpdateIntakeStageDto) {
    const intake = await this.findOne(user, id);
    if (intake.stage === dto.stage) return intake;

    const updated = await this.prisma.intake.update({
      where: { id },
      data: { stage: dto.stage as never, stageChangedAt: new Date() },
      include: this.intakeInclude,
    });

    if (dto.note?.trim()) {
      await this.prisma.intakeFollowUp.create({
        data: {
          intakeId: id,
          note: `[${intake.stage} → ${dto.stage}] ${dto.note.trim()}`,
          contacted: false,
          createdById: user.id,
        },
      });
    }

    return updated;
  }

  /** เอกสารที่ยังขาดและจำเป็น — ตัวกั้นก่อนออกหนังสือ/เปิดคดี */
  async missingDocuments(user: AuthUser, id: string) {
    const intake = await this.findOne(user, id);
    await this.seedDocumentRequests(user, id, intake.preLitigationType);
    const requests = await this.prisma.intakeDocumentRequest.findMany({
      where: { intakeId: id },
      orderBy: [{ required: 'desc' }, { requestedAt: 'asc' }],
    });
    const missing = requests.filter(
      (r) =>
        r.required &&
        r.status !== DocRequestStatus.RECEIVED &&
        r.status !== DocRequestStatus.NOT_APPLICABLE,
    );
    return { requests, missing, missingCount: missing.length };
  }

  /**
   * เติม checklist ครั้งแรกจาก template ตามประเภทงานก่อนฟ้อง
   *
   * ของเดิมหน้าเว็บ hardcode รายการนี้ไว้แล้วเก็บผลยืนยันไว้ที่ client —
   * ย้ายมาเป็นแถวจริงทำให้ทั้งการยืนยัน, `required`, กำหนดส่ง และด่านก่อน
   * ออกหนังสือ อ่านจากที่เดียวกัน. เรียกซ้ำได้: มีแถวแล้วไม่ทำอะไร
   */
  private async seedDocumentRequests(
    user: AuthUser,
    intakeId: string,
    preLitigationType: string | null | undefined,
  ) {
    const existing = await this.prisma.intakeDocumentRequest.count({ where: { intakeId } });
    if (existing > 0) return;

    await this.prisma.intakeDocumentRequest.createMany({
      data: preLitigationDocuments(preLitigationType).map((item) => ({
        intakeId,
        name: item.label,
        required: true,
        createdById: user.id,
      })),
      skipDuplicates: true,
    });
  }

  async addDocumentRequests(
    user: AuthUser,
    id: string,
    dto: BulkCreateDocumentRequestsDto | CreateDocumentRequestDto,
  ) {
    await this.findOne(user, id);
    const items = 'items' in dto ? dto.items : [dto];
    if (!items.length) throw new BadRequestException('ต้องระบุเอกสารอย่างน้อยหนึ่งรายการ');

    await this.prisma.intakeDocumentRequest.createMany({
      data: items.map((item) => ({
        intakeId: id,
        name: item.name.trim(),
        required: item.required ?? true,
        note: item.note,
        dueDate: item.dueDate ? new Date(item.dueDate) : null,
        createdById: user.id,
      })),
    });

    // ขอเอกสารแล้วก็คือกำลังรอเอกสาร — ไม่ต้องให้คนมาย้ายขั้นตอนเองอีกที
    if (
      this.stageIsBefore(await this.currentStage(id), IntakeStage.WAITING_DOCUMENTS)
    ) {
      await this.prisma.intake.update({
        where: { id },
        data: { stage: IntakeStage.WAITING_DOCUMENTS as never, stageChangedAt: new Date() },
      });
    }

    return this.missingDocuments(user, id);
  }

  async updateDocumentRequest(
    user: AuthUser,
    id: string,
    requestId: string,
    dto: UpdateDocumentRequestDto,
  ) {
    await this.findOne(user, id);
    const existing = await this.prisma.intakeDocumentRequest.findFirst({
      where: { id: requestId, intakeId: id },
    });
    if (!existing) throw new NotFoundException('ไม่พบรายการเอกสารนี้');

    const receiving = dto.status === DocRequestStatus.RECEIVED;
    await this.prisma.intakeDocumentRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status as never,
        note: dto.note,
        required: dto.required,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        documentId: dto.documentId,
        receivedAt: receiving ? (existing.receivedAt ?? new Date()) : dto.status ? null : undefined,
      },
    });
    return this.missingDocuments(user, id);
  }

  async removeDocumentRequest(user: AuthUser, id: string, requestId: string) {
    await this.findOne(user, id);
    const deleted = await this.prisma.intakeDocumentRequest.deleteMany({
      where: { id: requestId, intakeId: id },
    });
    if (!deleted.count) throw new NotFoundException('ไม่พบรายการเอกสารนี้');
    return this.missingDocuments(user, id);
  }

  /**
   * มุมมองแบบ checklist ของหน้ารับเรื่อง (label → ไฟล์ที่ยืนยัน)
   *
   * `__manual__` = ยืนยันว่าได้รับแล้วแต่ไม่ได้ผูกไฟล์, `__skipped__` = ไม่เกี่ยวข้อง
   * ทั้งสองค่าเป็นภาษาของหน้าจอเดิม ส่วนข้อมูลจริงเก็บเป็นสถานะใน
   * `IntakeDocumentRequest` เพียงที่เดียว
   */
  async getChecklist(user: AuthUser, id: string) {
    const { requests } = await this.missingDocuments(user, id);
    return requests
      .filter((r) => r.status === DocRequestStatus.RECEIVED || r.status === DocRequestStatus.NOT_APPLICABLE)
      .map((r) => ({
        label: r.name,
        documentId:
          r.status === DocRequestStatus.NOT_APPLICABLE
            ? CHECKLIST_SKIPPED
            : (r.documentId ?? CHECKLIST_MANUAL),
        confirmedAt: r.receivedAt,
      }));
  }

  async setChecklistItem(user: AuthUser, id: string, label: string, documentId: string | null) {
    const intake = await this.findOne(user, id);
    await this.seedDocumentRequests(user, id, intake.preLitigationType);

    const name = label.trim();
    const existing = await this.prisma.intakeDocumentRequest.findFirst({
      where: { intakeId: id, name },
    });

    const data =
      documentId === null
        ? { status: DocRequestStatus.REQUESTED, documentId: null, receivedAt: null }
        : documentId === CHECKLIST_SKIPPED
          ? { status: DocRequestStatus.NOT_APPLICABLE, documentId: null, receivedAt: null }
          : {
              status: DocRequestStatus.RECEIVED,
              documentId: documentId === CHECKLIST_MANUAL ? null : documentId,
              receivedAt: new Date(),
            };

    const row = existing
      ? await this.prisma.intakeDocumentRequest.update({
          where: { id: existing.id },
          data: data as never,
        })
      : await this.prisma.intakeDocumentRequest.create({
          data: { intakeId: id, name, createdById: user.id, ...data } as never,
        });

    return {
      label: row.name,
      documentId:
        row.status === DocRequestStatus.NOT_APPLICABLE
          ? CHECKLIST_SKIPPED
          : row.status === DocRequestStatus.RECEIVED
            ? (row.documentId ?? CHECKLIST_MANUAL)
            : null,
      confirmedAt: row.receivedAt,
    };
  }

  private async currentStage(id: string): Promise<IntakeStage> {
    const row = await this.prisma.intake.findUnique({ where: { id }, select: { stage: true } });
    return (row?.stage ?? IntakeStage.NEW_INQUIRY) as IntakeStage;
  }

  private stageIsBefore(current: IntakeStage, target: IntakeStage) {
    return INTAKE_STAGE_ORDER.indexOf(current) < INTAKE_STAGE_ORDER.indexOf(target);
  }

  listFollowUps(user: AuthUser, id: string) {
    return this.findOne(user, id).then(() =>
      this.prisma.intakeFollowUp.findMany({
        where: { intakeId: id },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  /** ติดต่อไปแล้วไม่ตอบ — ปิดวงจรของ lead ไว้ก่อน แต่ยังค้นเจอและเปิดต่อได้ */
  async markNoResponse(user: AuthUser, id: string, dto: NoResponseDto) {
    const intake = await this.findOne(user, id);
    if (intake.status === IntakeStatus.CONVERTED) {
      throw new BadRequestException('เรื่องนี้แปลงเป็นคดีแล้ว');
    }
    return this.prisma.intake.update({
      where: { id },
      data: {
        status: IntakeStatus.NO_RESPONSE as never,
        statusChangedAt: new Date(),
        decisionNotes: dto.note ?? intake.decisionNotes,
      },
      include: this.intakeInclude,
    });
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
    await this.assertCanAssign(
      user,
      (dto.assignedUserIds ?? []).filter((uid) => uid !== user.id),
    );
    const created = await this.prisma.intake.create({
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
        customerRef: dto.customerRef,
        insurerName: dto.insurerName,
        policyNumber: dto.policyNumber,
        claimNumber: dto.claimNumber,
        incidentDate: dto.incidentDate ? new Date(dto.incidentDate) : undefined,
        description: dto.description,
        estimatedDamage: dto.estimatedDamage,
        assignedUserIds: dto.assignedUserIds ?? [],
        deadlineDate: dto.deadlineDate ? new Date(dto.deadlineDate) : undefined,
        relatedCaseId: dto.relatedCaseId,
        isOngoingElsewhere: dto.isOngoingElsewhere ?? false,
        externalCaseNumber: dto.externalCaseNumber,
        currentStageNote: dto.currentStageNote,
        nextFollowUpAt: dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : undefined,
        followUpOwnerId: dto.followUpOwnerId,
        preLitigationType: dto.preLitigationType as any,
        preLitigationStatus: dto.preLitigationStatus as any,
        preLitigationNotes: dto.preLitigationNotes,
        settlementOfferAmount: dto.settlementOfferAmount,
        customers: dto.customers?.length
          ? { create: this.customerRows(dto.customers) }
          : undefined,
        additionalClients: dto.clients?.length
          ? { create: this.additionalClientRows(dto.clients) }
          : undefined,
      },
      include: this.intakeInclude,
    });

    if (dto.assignedUserIds?.length) {
      await this.assignmentNotifier.notifyAssigned({
        userIds: dto.assignedUserIds,
        actorUserId: user.id,
        summaryText: `📥 คุณได้รับมอบหมายเรื่องรับใหม่\nเรื่อง: ${created.title}`,
        entityPath: `/intake/${created.id}`,
      });
    }

    return created;
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

  /**
   * Assignment follows the firm hierarchy: you may hand work only to members
   * whose role is strictly below yours (owner > senior > lawyer > assistant).
   * Keeping yourself or already-assigned members on the list is always fine.
   */
  private async assertCanAssign(user: AuthUser, newIds: string[]) {
    if (newIds.length === 0) return;
    const members = await this.prisma.firmMember.findMany({
      where: { firmId: user.firmId, userId: { in: newIds } },
      select: { userId: true, role: true },
    });
    const byId = new Map(members.map((m) => [m.userId, m.role]));
    for (const targetId of newIds) {
      const targetRole = byId.get(targetId);
      if (!targetRole) throw new BadRequestException('ผู้รับมอบหมายไม่ได้อยู่ในสำนักงานนี้');
      if (!canAssignFirmRole(user.firmRole, targetRole as FirmRole)) {
        throw new BadRequestException('มอบหมายได้เฉพาะสมาชิกที่มีบทบาทต่ำกว่าของคุณเท่านั้น');
      }
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateIntakeDto) {
    const existing = await this.findOne(user, id);
    let newlyAssigned: string[] = [];
    if (dto.assignedUserIds) {
      const already = new Set([...(existing.assignedUserIds ?? []), user.id]);
      newlyAssigned = dto.assignedUserIds.filter((uid) => !already.has(uid));
      await this.assertCanAssign(user, newlyAssigned);
    }
    if (dto.relatedCaseId) {
      const relatedCase = await this.prisma.case.findFirst({
        where: { id: dto.relatedCaseId, firmId: user.firmId },
      });
      if (!relatedCase) {
        throw new BadRequestException('ไม่พบคดีที่เลือกไว้ในสำนักงานนี้');
      }
    }
    await this.resetConfirmationForEditedFields(id, dto);
    const updated = await this.prisma.intake.update({
      where: { id },
      data: {
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
        assignedUserIds: dto.assignedUserIds,
        title: dto.title,
        referralType: dto.referralType as any,
        referralChannel: dto.referralChannel as any,
        referralName: dto.referralName,
        clientId: dto.clientId,
        clientName: dto.clientName,
        contactName: dto.contactName,
        matterType: dto.matterType,
        opposingParty: dto.opposingParty,
        customerRef: dto.customerRef,
        insurerName: dto.insurerName,
        policyNumber: dto.policyNumber,
        claimNumber: dto.claimNumber,
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
        customers: dto.customers
          ? {
              deleteMany: {},
              create: this.customerRows(dto.customers),
            }
          : undefined,
        additionalClients: dto.clients
          ? {
              deleteMany: {},
              create: this.additionalClientRows(dto.clients),
            }
          : undefined,
      },
      include: this.intakeInclude,
    });

    if (newlyAssigned.length) {
      await this.assignmentNotifier.notifyAssigned({
        userIds: newlyAssigned,
        actorUserId: user.id,
        summaryText: `📥 คุณได้รับมอบหมายเรื่องรับใหม่\nเรื่อง: ${updated.title}`,
        entityPath: `/intake/${updated.id}`,
      });
    }

    return updated;
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
        statusChangedAt: new Date(),
        stage: IntakeStage.SCREENING as never,
        stageChangedAt: new Date(),
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
        statusChangedAt: new Date(),
        stage: (status === 'ACCEPTED'
          ? IntakeStage.PROPOSAL
          : status === 'CONSULTED'
            ? IntakeStage.CONSULTED
            : IntakeStage.CLOSED) as never,
        stageChangedAt: new Date(),
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

    // ออกหนังสือโดยเอกสารยังไม่ครบคือสาเหตุที่ต้องออกหนังสือฉบับที่สอง
    // ข้ามได้ถ้าเรื่องเร่ง แต่ต้องกดรับทราบว่ายังขาดอะไร
    if (!existing.noticeIssuedAt) {
      const { missing } = await this.missingDocuments(user, id);
      if (missing.length && !dto.acknowledgeMissingDocuments) {
        throw new BadRequestException({
          message: `ยังขาดเอกสารที่ขอไว้ ${missing.length} รายการ — ตรวจแล้วยืนยันอีกครั้งเพื่อออกหนังสือ`,
          missing: missing.map((m) => ({ id: m.id, name: m.name, status: m.status })),
        });
      }
    }

    const updated = await this.prisma.intake.update({
      where: { id },
      data: {
        noticeIssuedAt: new Date(),
        noticeRecipient: dto.noticeRecipient,
        noticeDeadline: dto.noticeDeadline ? new Date(dto.noticeDeadline) : undefined,
        noticeResult: dto.noticeResult,
        noticeContent: dto.noticeContent,
        stage: IntakeStage.PRE_LITIGATION_NOTICE as never,
        stageChangedAt: new Date(),
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

  /**
   * ไม่ให้เปิดคดีโดยยังไม่ได้ตรวจผลประโยชน์ขัดกัน
   *
   * ข้ามได้ แต่ต้องพิมพ์เหตุผล — เพราะบางเรื่องเร่งจริง และระบบไม่ควรตัดสินใจ
   * แทนทนาย. สิ่งที่ห้ามคือ "ข้ามแบบไม่มีใครรู้"
   */
  private async assertConflictCleared(user: AuthUser, intakeId: string, overrideReason?: string) {
    const latest = await this.conflictCheck.latestForIntake(intakeId);
    const cleared = latest?.result === 'CLEAR';
    if (cleared) return { latest, overridden: false as const };

    if (!overrideReason?.trim()) {
      throw new BadRequestException(
        latest
          ? `ผลตรวจ conflict ล่าสุดคือ ${latest.result} — ต้องระบุเหตุผลที่ยังเปิดคดี`
          : 'ยังไม่ได้ตรวจผลประโยชน์ขัดกัน (conflict check) สำหรับเรื่องนี้',
      );
    }
    return { latest, overridden: true as const };
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

    await this.assertConflictCleared(user, intake.id, dto.conflictOverrideReason);

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
        customerRef: intake.customerRef ?? undefined,
        clientId: intake.clientId ?? undefined,
        clientName: intake.clientName ?? undefined,
        // ลูกค้า (ผู้ว่าจ้าง/ผู้จ่าย) ตามมาจาก intake; ถ้าไม่ได้ระบุไว้ ให้ลูกความเป็นลูกค้าเอง
        customers: intake.customers?.length
          ? {
              create: intake.customers.map((c) => ({
                customerId: c.customerId,
                sharePercent: c.sharePercent,
                isPrimary: c.isPrimary,
                note: c.note,
              })),
            }
          : intake.clientId
            ? { create: [{ customerId: intake.clientId, sharePercent: 100, isPrimary: true }] }
            : undefined,
        additionalClients: intake.additionalClients?.length
          ? {
              create: intake.additionalClients.map((c) => ({
                clientId: c.clientId,
                note: c.note,
              })),
            }
          : undefined,
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

    // งานประกันที่กรอกบริษัทมาตั้งแต่รับเรื่อง เปิดเคลมให้เลย ไม่ต้องไปกรอกซ้ำที่คดี
    if (intake.insurerName) {
      await this.prisma.insuranceClaim.create({
        data: {
          caseId: newCase.id,
          insurerName: intake.insurerName,
          policyNumber: intake.policyNumber,
          claimNumber: intake.claimNumber,
          incidentDate: intake.incidentDate ?? new Date(),
          createdById: user.id,
        },
      });
    }

    if (dto.conflictOverrideReason?.trim()) {
      await this.caseFeed.log({
        caseId: newCase.id,
        userId: user.id,
        type: ActivityType.NOTE,
        title: 'เปิดคดีโดยข้ามผลตรวจ conflict',
        description: dto.conflictOverrideReason.trim(),
      });
    }

    await this.prisma.intake.update({
      where: { id },
      data: {
        status: 'CONVERTED' as any,
        statusChangedAt: new Date(),
        stage: IntakeStage.CLOSED as never,
        stageChangedAt: new Date(),
      },
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
      data: {
        status: 'CONVERTED' as any,
        statusChangedAt: new Date(),
        stage: IntakeStage.CLOSED as never,
        stageChangedAt: new Date(),
      },
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
    return this.prisma.$transaction(async (tx) => {
      // Serialize conversion attempts for this submission, including retries.
      await tx.$queryRaw`SELECT "id" FROM "PortalIntakeSubmission" WHERE "id" = ${submissionId} FOR UPDATE`;
      const submission = await tx.portalIntakeSubmission.findFirst({
        where: { id: submissionId, client: { firmId: user.firmId } },
      });
      if (!submission) {
        throw new NotFoundException('ไม่พบเรื่องที่ส่งจาก Portal นี้');
      }
      if (submission.withdrawnByClient) {
        throw new BadRequestException('เรื่องนี้ถูกถอนโดยลูกความแล้ว');
      }
      if (submission.intakeId) {
        const existing = await tx.intake.findFirst({
          where: { id: submission.intakeId, firmId: user.firmId },
        });
        if (!existing) throw new NotFoundException('ไม่พบเรื่องรับที่เชื่อมไว้');
        return existing;
      }

      const intake = await tx.intake.create({
        data: {
          firmId: user.firmId,
          receivedById: user.id,
          receivedDate: new Date(),
          title: submission.title,
          description: submission.detail,
          referralChannel: ReferralChannel.PORTAL,
          clientId: submission.clientId,
          requestedResponseDate: submission.clientRequestedDate,
          deadlineDate: dto.officePlannedDate ? new Date(dto.officePlannedDate) : undefined,
          portalSubmissionId: submission.id,
        },
      });

      await tx.portalIntakeSubmission.update({
        where: { id: submission.id },
        data: { intakeId: intake.id },
      });
      return intake;
    });
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
      throw new BadRequestException('ไฟล์มีขนาดใหญ่เกิน 30MB');
    }

    const fileId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = path.posix.join('intake', intakeId, `${fileId}.pdf`);
    const storagePath = await this.fileStorage.put(key, file.buffer, file.mimetype);

    return this.prisma.intakeAttachment.create({
      data: {
        intakeId,
        filename: decodeUploadFilename(file.originalname),
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

    // The file may already be gone (manual cleanup, a prior partial failure,
    // a DB restored without its files). Never let that block removing the DB
    // row, or the attachment becomes permanently un-deletable.
    try {
      await this.fileStorage.delete(attachment.storagePath);
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

function wholeDaysSince(from: Date | null | undefined, now = Date.now()): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((now - new Date(from).getTime()) / MS_PER_DAY));
}

/**
 * เติมอายุของเรื่องให้ทุกแถวในรายการ — เพราะคำถามของหน้า intake ไม่ใช่
 * "อยู่สถานะอะไร" แต่เป็น "ค้างมากี่วันแล้ว และเลยนัดติดตามไหม"
 */
export function withAging<
  T extends {
    createdAt: Date;
    statusChangedAt?: Date | null;
    stageChangedAt?: Date | null;
    nextFollowUpAt?: Date | null;
  },
>(intake: T) {
  const now = Date.now();
  return {
    ...intake,
    ageDays: wholeDaysSince(intake.createdAt, now) ?? 0,
    daysInStatus: wholeDaysSince(intake.statusChangedAt ?? intake.createdAt, now) ?? 0,
    daysInStage: wholeDaysSince(intake.stageChangedAt ?? intake.createdAt, now) ?? 0,
    followUpOverdueDays: intake.nextFollowUpAt
      ? Math.max(0, Math.floor((now - new Date(intake.nextFollowUpAt).getTime()) / MS_PER_DAY))
      : null,
  };
}
