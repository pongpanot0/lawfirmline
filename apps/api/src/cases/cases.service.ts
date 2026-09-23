import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  AssignmentType,
  AuthUser,
  ActivityType,
  CaseOutcome,
  CaseStage,
  CaseStatus,
  FirmRole,
} from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CreateCaseDto, UpdateCaseDto, CaseQueryDto, UpdateCaseAssignmentsDto } from './dto/case.dto';
import { CustomerShareDto, AdditionalClientDto } from '../intake/dto/intake.dto';
import { CloseCaseDto } from './dto/close-case.dto';
import { Prisma } from '../generated/prisma';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CLIENT_CONTACT_SELECT } from '../clients/client-contact.select';
import { CargoClaimsService } from '../cargo-claims/cargo-claims.service';
import { Optional } from '@nestjs/common';
import { formatCaseNotificationReference } from '../notifications/reference-label';

function caseAssignmentSummary(prefix: string, legalCase: { title: string; ownRef?: string | null; blackCaseNumber?: string | null; redCaseNumber?: string | null }) {
  const reference = formatCaseNotificationReference(legalCase);
  return `${prefix}\nคดี: ${legalCase.title}${reference ? `\n${reference}` : ''}`;
}

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private caseFeed: CaseFeedService,
    private activitiesService: CaseActivitiesService,
    private assignmentNotifier: AssignmentNotifierService,
    @Optional() private cargoClaims?: CargoClaimsService,
  ) {}

  private caseInclude = {
    leadLawyer: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    caseType: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
    cargoClaim: { select: { id: true } },
    participants: { select: { name: true, role: true } },
    // งานก่อนฟ้อง (โนติส/เจรจา) ยังบันทึกอยู่บน intake ที่ผูก 1:1 — หน้าคดีใช้แสดงสถานะ
    intake: {
      select: {
        id: true,
        status: true,
        noticeIssuedAt: true,
        noticeDeadline: true,
        noticeRecipient: true,
        noticeResult: true,
        preLitigationStatus: true,
        settlementOfferAmount: true,
      },
    },
    relatedIntakes: { select: { id: true, status: true } },
    customers: {
      orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
      select: {
        id: true,
        customerId: true,
        contactId: true,
        sharePercent: true,
        isPrimary: true,
        note: true,
        customer: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, phone: true, email: true } },
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
    assignments: {
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
    },
    _count: { select: { tasks: true, documents: true } },
  };

  async findAll(user: AuthUser, query: CaseQueryDto) {
    const accessFilter = this.caseAccess.getCaseFilterForUser(user);
    const where: Prisma.CaseWhereInput = { ...accessFilter };

    if (query.status) {
      where.status = query.status;
    }
    if (query.stage) {
      where.stage = query.stage;
    }
    if (query.caseTypeId) {
      where.caseTypeId = query.caseTypeId;
    }
    if (query.party) {
      const party = query.party.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { participants: { some: { name: { contains: party, mode: 'insensitive' } } } },
      ];
    }
    if (query.userId) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: [{ leadLawyerId: query.userId }, { assignments: { some: { userId: query.userId } } }] },
      ];
    }
    if (query.search) {
      const term = query.search.trim();
      const searchFilter: Prisma.CaseWhereInput = {
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { ownRef: { contains: term, mode: 'insensitive' } },
          { customerRef: { contains: term, mode: 'insensitive' } },
          { clientName: { contains: term, mode: 'insensitive' } },
          { folderId: { contains: term, mode: 'insensitive' } },
          { courtName: { contains: term, mode: 'insensitive' } },
          { blackCaseNumber: { contains: term, mode: 'insensitive' } },
          { redCaseNumber: { contains: term, mode: 'insensitive' } },
          { client: { name: { contains: term, mode: 'insensitive' } } },
          // ชื่อคู่กรณี/พยานต้องค้นเจอด้วย — คดีถูกจำด้วยชื่อคน ไม่ใช่เลขคดี
          { participants: { some: { name: { contains: term, mode: 'insensitive' } } } },
        ],
      };
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), searchFilter];
    }

    return this.prisma.case.findMany({
      where,
      include: this.caseInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const hasAccess = await this.caseAccess.canAccessCase(user, id);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this case');
    }

    const legalCase = await this.prisma.case.findUnique({
      where: { id },
      include: {
        ...this.caseInclude,
        tasks: {
          where: this.caseAccess.getTaskFilterForUser(user),
          include: {
            assignee: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        calendarEvents: { orderBy: { startAt: 'asc' }, take: 10 },
        activities: {
          include: {
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { activityAt: 'desc' },
          take: 20,
        },
        participants: { orderBy: { createdAt: 'asc' } },
        insuranceClaim: true,
        client: {
          select: {
            id: true,
            name: true,
            contacts: {
              select: CLIENT_CONTACT_SELECT,
              orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
            },
          },
        },
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');
    return legalCase;
  }

  private generateFolderId(): string {
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `LF-${year}-${rand}`;
  }

  /** Bangkok calendar year for Own Ref sequencing. */
  private bangkokYear(date = new Date()): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
    }).format(date);
  }

  /**
   * Own Ref format: {prefix}{YYYY}{NNNN}
   * e.g. TSBREF20260001 — sequence runs through the calendar year, resets each Jan 1 (Bangkok).
   */
  async generateOwnRef(firmId: string): Promise<string> {
    const firm = await this.prisma.firm.findUnique({
      where: { id: firmId },
      select: { ownRefPrefix: true },
    });
    const prefix = (firm?.ownRefPrefix || 'TSBREF').toUpperCase();
    const year = this.bangkokYear();
    const yearKey = `${prefix}${year}`;

    const existing = await this.prisma.case.findMany({
      where: {
        firmId,
        ownRef: { startsWith: yearKey },
      },
      select: { ownRef: true },
    });

    let maxSeq = 0;
    const pattern = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${year}(\\d+)$`,
    );
    for (const row of existing) {
      const match = row.ownRef.match(pattern);
      if (!match) continue;
      const seq = parseInt(match[1], 10);
      if (!Number.isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }

    const nextSeq = String(maxSeq + 1).padStart(4, '0');
    return `${prefix}${year}${nextSeq}`;
  }

  async previewNextOwnRef(user: AuthUser) {
    const ownRef = await this.generateOwnRef(user.firmId);
    return { ownRef };
  }

  /** ลูกค้า = ผู้ว่าจ้าง/ผู้จ่าย; ถ้าไม่มีใครถูกตั้งเป็นหลัก ให้รายแรกเป็นหลัก */
  private customerRows(customers: CustomerShareDto[]) {
    const hasPrimary = customers.some((c) => c.isPrimary);
    return customers.map((c, index) => ({
      customerId: c.customerId,
      contactId: c.contactId ?? null,
      sharePercent: c.sharePercent ?? null,
      isPrimary: c.isPrimary ?? (!hasPrimary && index === 0),
      note: c.note ?? null,
    }));
  }

  /** ลูกความเพิ่มเติม (เกินคนที่ 1) — ลูกความหลักยังคงเป็น clientId */
  private additionalClientRows(clients: AdditionalClientDto[]) {
    return clients.map((c) => ({ clientId: c.clientId, note: c.note ?? null }));
  }

  async create(user: AuthUser, dto: CreateCaseDto) {
    let ownRef = dto.ownRef?.trim()
      ? dto.ownRef.trim()
      : await this.generateOwnRef(user.firmId);

    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await this.prisma.case.findUnique({
        where: { firmId_ownRef: { firmId: user.firmId, ownRef } },
      });
      if (!existing) break;
      if (dto.ownRef?.trim()) {
        throw new ConflictException('Own ref already exists');
      }
      if (attempt === 4) {
        throw new ConflictException('Could not allocate a unique Own Ref — please retry');
      }
      ownRef = await this.generateOwnRef(user.firmId);
    }

    if (dto.caseTypeId) {
      const caseType = await this.prisma.caseType.findFirst({
        where: { id: dto.caseTypeId, firmId: user.firmId, isActive: true },
      });
      if (!caseType) {
        throw new BadRequestException('Invalid or inactive case type');
      }
    }

    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, firmId: user.firmId },
      });
      if (!client) {
        throw new BadRequestException('Invalid client');
      }
      if (!dto.clientName) {
        dto.clientName = client.name;
      }
    }

    const teamUserIds = [
      dto.leadLawyerId,
      ...(dto.buddyIds ?? []),
    ];
    const uniqueTeamUserIds = [...new Set(teamUserIds)];
    const firmMembers = await this.prisma.firmMember.count({
      where: { firmId: user.firmId, userId: { in: uniqueTeamUserIds } },
    });
    if (firmMembers !== uniqueTeamUserIds.length) {
      throw new BadRequestException('All assigned team members must belong to your firm');
    }

    const buddyIds = [...new Set((dto.buddyIds ?? []).filter((id) => id !== dto.leadLawyerId))];
    const assignments: Prisma.CaseAssignmentCreateWithoutCaseInput[] = buddyIds.map(
      (userId) => ({
        user: { connect: { id: userId } },
        assignmentType: AssignmentType.BUDDY,
      }),
    );

    const created = await this.prisma.case.create({
      data: {
        firmId: user.firmId,
        ownRef,
        customerRef: dto.customerRef,
        folderId: this.generateFolderId(),
        title: dto.title,
        description: dto.description,
        stage: CaseStage.PRE_LITIGATION,
        clientId: dto.clientId,
        clientName: dto.clientName,
        partyRole: dto.partyRole as any,
        courtName: dto.courtName,
        courtLevel: dto.courtLevel,
        blackCaseNumber: dto.blackCaseNumber || null,
        redCaseNumber: dto.redCaseNumber || null,
        customFields: dto.customFields as Prisma.InputJsonValue,
        estimatedFee: dto.estimatedFee,
        claimedAmount: dto.claimedAmount,
        status: dto.status,
        caseTypeId: dto.caseTypeId ?? undefined,
        leadLawyerId: dto.leadLawyerId,
        assignments: assignments.length ? { create: assignments } : undefined,
        customers: dto.customers?.length
          ? { create: this.customerRows(dto.customers) }
          : undefined,
        additionalClients: dto.clients?.length
          ? { create: this.additionalClientRows(dto.clients) }
          : undefined,
      },
      include: this.caseInclude,
    });

    await this.caseFeed.log({
      caseId: created.id,
      userId: user.id,
      type: ActivityType.NOTE,
      title: 'เปิดคดี',
      at: created.openedAt,
    });

    if (dto.initialActivity) {
      await this.activitiesService.create(
        user,
        created.id,
        dto.initialActivity,
        dto.courtName,
      );
    }

    if ((dto.cargoClaimEnabled || dto.cargoClaim) && this.cargoClaims) {
      await this.cargoClaims.ensureForCase(user, created.id, dto.cargoClaim);
    }

    if (dto.leadLawyerId && dto.leadLawyerId !== user.id) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [dto.leadLawyerId],
        actorUserId: user.id,
        summaryText: caseAssignmentSummary('⚖️ คุณได้รับมอบหมายเป็นทนายเจ้าของคดี', created),
        entityPath: `/cases/${created.id}`,
      });
    }
    if (buddyIds.length) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: buddyIds,
        actorUserId: user.id,
        summaryText: caseAssignmentSummary('⚖️ คุณได้รับมอบหมายเข้าทีมคดี', created),
        entityPath: `/cases/${created.id}`,
      });
    }

    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateCaseDto) {
    const before = await this.findOne(user, id);

    if (dto.ownRef?.trim() && dto.ownRef.trim() !== before.ownRef) {
      const existing = await this.prisma.case.findUnique({
        where: { firmId_ownRef: { firmId: user.firmId, ownRef: dto.ownRef.trim() } },
      });
      if (existing) throw new ConflictException('เลขอ้างอิงสำนักงานนี้ถูกใช้กับคดีอื่นแล้ว');
    }

    if (dto.leadLawyerId) {
      if (user.firmRole !== FirmRole.OWNER) {
        throw new ForbiddenException('Only owners can reassign the case lead lawyer');
      }
      const isMember = await this.prisma.firmMember.count({
        where: { firmId: user.firmId, userId: dto.leadLawyerId },
      });
      if (!isMember) {
        throw new BadRequestException('Lead lawyer must belong to your firm');
      }
    }

    const { customFields, customers, ...rest } = dto;
    const stageChanged = !!dto.stage && dto.stage !== before.stage;
    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        ...rest,
        ownRef: dto.ownRef?.trim() || undefined,
        customFields: customFields as Prisma.InputJsonValue | undefined,
        customers:
          customers === undefined
            ? undefined
            : { deleteMany: {}, create: this.customerRows(customers) },
        closedAt: dto.closedAt ? new Date(dto.closedAt) : undefined,
        stageChangedAt: stageChanged ? new Date() : undefined,
      },
      include: this.caseInclude,
    });

    // Timeline ของคดีต้องตอบได้เองว่าใครเปลี่ยนอะไรเมื่อไร ไม่ใช่รอให้คนมากรอก
    if (dto.status && dto.status !== before.status) {
      await this.caseFeed.log({
        caseId: id,
        userId: user.id,
        type: ActivityType.STATUS_CHANGE,
        title: `สถานะคดี: ${before.status} → ${dto.status}`,
        statusTransition: { from: before.status, to: dto.status },
      });
    }
    if (stageChanged) {
      await this.caseFeed.log({
        caseId: id,
        userId: user.id,
        type: ActivityType.STAGE_CHANGE,
        title: `ขั้นตอนคดี: ${before.stage} → ${dto.stage}`,
      });
    }
    if (dto.leadLawyerId && dto.leadLawyerId !== before.leadLawyerId) {
      await this.caseFeed.log({
        caseId: id,
        userId: user.id,
        type: ActivityType.ASSIGNMENT,
        title: 'เปลี่ยนทนายเจ้าของคดี',
        description: `${before.leadLawyer?.firstName ?? before.leadLawyerId} → ${
          updated.leadLawyer?.firstName ?? dto.leadLawyerId
        }`,
      });
      await this.prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'CASE_OWNER_CHANGED',
          metadata: { caseId: id, from: before.leadLawyerId, to: dto.leadLawyerId },
        },
      });
    }

    if (
      dto.leadLawyerId &&
      dto.leadLawyerId !== before.leadLawyerId &&
      dto.leadLawyerId !== user.id
    ) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: [dto.leadLawyerId],
        actorUserId: user.id,
        summaryText: caseAssignmentSummary('⚖️ คุณได้รับมอบหมายเป็นทนายเจ้าของคดี', updated),
        entityPath: `/cases/${id}`,
      });
    }

    return updated;
  }

  async updateAssignments(user: AuthUser, id: string, dto: UpdateCaseAssignmentsDto) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id, firmId: user.firmId },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const buddyIds = [
      ...new Set(dto.buddyIds.filter((uid) => uid !== legalCase.leadLawyerId)),
    ];

    // Snapshot before the delete+recreate below so only genuinely new
    // buddies get a DM, not everyone re-written into the table.
    const previousBuddies = await this.prisma.caseAssignment.findMany({
      where: { caseId: id, assignmentType: AssignmentType.BUDDY },
      select: { userId: true },
    });
    const previousBuddyIds = new Set(previousBuddies.map((b) => b.userId));

    if (buddyIds.length) {
      const firmMembers = await this.prisma.firmMember.count({
        where: { firmId: user.firmId, userId: { in: buddyIds } },
      });
      if (firmMembers !== buddyIds.length) {
        throw new BadRequestException('All assigned team members must belong to your firm');
      }
    }

    await this.prisma.$transaction([
      this.prisma.caseAssignment.deleteMany({
        where: { caseId: id, assignmentType: AssignmentType.BUDDY },
      }),
      ...(buddyIds.length
        ? [
            this.prisma.caseAssignment.createMany({
              data: buddyIds.map((userId) => ({
                caseId: id,
                userId,
                assignmentType: AssignmentType.BUDDY,
              })),
            }),
          ]
        : []),
    ]);

    const result = await this.prisma.case.findUnique({ where: { id }, include: this.caseInclude });

    const newBuddyIds = buddyIds.filter((uid) => !previousBuddyIds.has(uid));
    const removedIds = [...previousBuddyIds].filter((uid) => !buddyIds.includes(uid));
    if (newBuddyIds.length || removedIds.length) {
      await this.caseFeed.log({
        caseId: id,
        userId: user.id,
        type: ActivityType.ASSIGNMENT,
        title: 'เปลี่ยนทีมงานในคดี',
        description: [
          newBuddyIds.length ? `เพิ่ม ${newBuddyIds.length} คน` : null,
          removedIds.length ? `ออก ${removedIds.length} คน` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
    if (newBuddyIds.length) {
      await this.assignmentNotifier.notifyAssigned({
        firmId: user.firmId,
        userIds: newBuddyIds,
        actorUserId: user.id,
        summaryText: caseAssignmentSummary('⚖️ คุณได้รับมอบหมายเข้าทีมคดี', result ?? legalCase),
        entityPath: `/cases/${id}`,
      });
    }

    return result;
  }

  /**
   * งานที่ยังค้างอยู่ตอนจะปิดคดี — งานที่ยังไม่เสร็จ, วันนัดในอนาคต,
   * และเอกสารที่ยังไม่ผ่านการอนุมัติ. ปิดคดีทับของค้างเงียบ ๆ คือวิธีทำให้
   * ของค้างหายไปจากสายตา ไม่ใช่ทำให้มันเสร็จ
   */
  async outstanding(user: AuthUser, id: string) {
    await this.findOne(user, id);
    const now = new Date();
    const [openTasks, upcomingEvents, unapprovedDocuments] = await Promise.all([
      this.prisma.task.findMany({
        where: { caseId: id, status: { not: 'DONE' } },
        select: { id: true, title: true, status: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.calendarEvent.findMany({
        where: { caseId: id, startAt: { gte: now } },
        select: { id: true, title: true, startAt: true, type: true },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.document.findMany({
        where: {
          caseId: id,
          versions: { some: { status: { in: ['DRAFT', 'WAITING_REVIEW', 'RETURNED_FOR_CHANGES'] } } },
        },
        select: { id: true, filename: true, category: true },
      }),
    ]);

    return {
      openTasks,
      upcomingEvents,
      unapprovedDocuments,
      total: openTasks.length + upcomingEvents.length + unapprovedDocuments.length,
    };
  }

  async close(user: AuthUser, id: string, dto: CloseCaseDto) {
    const legalCase = await this.findOne(user, id);
    if (legalCase.status === CaseStatus.CLOSED || legalCase.status === CaseStatus.ARCHIVED) {
      throw new BadRequestException('คดีนี้ปิดแล้ว');
    }

    // ระบบไม่ตัดสินใจแทนทนายว่าของค้างสำคัญหรือไม่ แต่ต้องบังคับให้เห็นก่อนปิด
    const outstanding = await this.outstanding(user, id);
    if (outstanding.total > 0 && !dto.acknowledgeOutstanding) {
      throw new BadRequestException({
        message: 'ยังมีงาน/วันนัด/เอกสารค้างอยู่ — ตรวจแล้วยืนยันอีกครั้งเพื่อปิดคดี',
        outstanding,
      });
    }

    const now = new Date();
    const closed = await this.prisma.case.update({
      where: { id },
      data: {
        status: CaseStatus.CLOSED,
        stage: CaseStage.CLOSING,
        stageChangedAt: now,
        outcome: dto.outcome ?? undefined,
        closedAt: now,
        closingSummary: dto.closingSummary.trim(),
      },
      include: this.caseInclude,
    });

    await this.caseFeed.log({
      caseId: id,
      userId: user.id,
      type: ActivityType.STATUS_CHANGE,
      title: 'ปิดคดี / Case Closed',
      description: [
        dto.closingSummary.trim(),
        dto.outcome ? `ผลคดี: ${dto.outcome}` : null,
        outstanding.total > 0 ? `ปิดโดยรับทราบของค้าง ${outstanding.total} รายการ` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      at: now,
      statusTransition: { from: legalCase.status, to: CaseStatus.CLOSED },
    });

    return closed;
  }

  /**
   * เก็บคดีที่ปิดแล้วเข้าคลัง — แยกจาก CLOSED เพื่อให้รายการคดีที่ทำงานอยู่
   * ไม่ยาวขึ้นทุกปี ข้อมูลยังอยู่ครบและ reopen ได้
   */
  async archive(user: AuthUser, id: string) {
    const legalCase = await this.findOne(user, id);
    if (legalCase.status !== CaseStatus.CLOSED) {
      throw new BadRequestException('เก็บเข้าคลังได้เฉพาะคดีที่ปิดแล้ว');
    }
    const archived = await this.prisma.case.update({
      where: { id },
      data: { status: CaseStatus.ARCHIVED },
      include: this.caseInclude,
    });
    await this.caseFeed.log({
      caseId: id,
      userId: user.id,
      type: ActivityType.STATUS_CHANGE,
      title: 'เก็บคดีเข้าคลัง / Archived',
      statusTransition: { from: CaseStatus.CLOSED, to: CaseStatus.ARCHIVED },
    });
    return archived;
  }

  async reopen(user: AuthUser, id: string) {
    const legalCase = await this.findOne(user, id);
    if (legalCase.status !== CaseStatus.CLOSED && legalCase.status !== CaseStatus.ARCHIVED) {
      throw new BadRequestException('คดีนี้ยังไม่ได้ปิด');
    }

    const reopened = await this.prisma.case.update({
      where: { id },
      data: {
        status: CaseStatus.IN_PROGRESS,
        closedAt: null,
        outcome: CaseOutcome.IN_PROGRESS,
      },
      include: this.caseInclude,
    });
    await this.caseFeed.log({
      caseId: id,
      userId: user.id,
      type: ActivityType.STATUS_CHANGE,
      title: 'เปิดคดีขึ้นมาใหม่ / Reopened',
      statusTransition: { from: legalCase.status, to: CaseStatus.IN_PROGRESS },
    });
    return reopened;
  }

  /**
   * ลบแบบ soft เท่านั้น — relation ของคดีทั้ง 20 ตารางเป็น onDelete: Cascade
   * ลบจริงครั้งเดียวคือเอกสาร/งาน/ค่าใช้จ่ายหายถาวร กู้ได้แค่ผ่าน RDS snapshot
   * คดีที่ลบแล้วถูกกรองออกทุก query ที่ CaseAccessService
   */
  async remove(user: AuthUser, id: string) {
    if (user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Only owners can delete cases');
    }
    const legalCase = await this.findOne(user, id);
    await this.prisma.$transaction([
      this.prisma.case.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'CASE_DELETED',
          metadata: { caseId: id, ownRef: legalCase.ownRef, title: legalCase.title },
        },
      }),
    ]);
    return { deleted: true };
  }
}
