import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AssignmentType, AuthUser, ActivityType, CaseStatus, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CreateCaseDto, UpdateCaseDto, CaseQueryDto, UpdateCaseAssignmentsDto } from './dto/case.dto';
import { CloseCaseDto } from './dto/close-case.dto';
import { Prisma } from '../generated/prisma';
import { CaseActivitiesService } from './case-activities.service';

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private activitiesService: CaseActivitiesService,
  ) {}

  private caseInclude = {
    leadLawyer: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    caseType: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
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
    if (query.caseTypeId) {
      where.caseTypeId = query.caseTypeId;
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
            contacts: { orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] },
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
        clientId: dto.clientId,
        clientName: dto.clientName,
        courtName: dto.courtName,
        courtLevel: dto.courtLevel,
        blackCaseNumber: dto.blackCaseNumber,
        redCaseNumber: dto.redCaseNumber,
        customFields: dto.customFields as Prisma.InputJsonValue,
        estimatedFee: dto.estimatedFee,
        claimedAmount: dto.claimedAmount,
        status: dto.status,
        caseTypeId: dto.caseTypeId ?? undefined,
        leadLawyerId: dto.leadLawyerId,
        assignments: assignments.length ? { create: assignments } : undefined,
      },
      include: this.caseInclude,
    });

    if (dto.initialActivity) {
      await this.activitiesService.create(
        user,
        created.id,
        dto.initialActivity,
        dto.courtName,
      );
    }

    return created;
  }

  async update(user: AuthUser, id: string, dto: UpdateCaseDto) {
    await this.findOne(user, id);

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

    const { customFields, ...rest } = dto;
    return this.prisma.case.update({
      where: { id },
      data: {
        ...rest,
        customFields: customFields as Prisma.InputJsonValue | undefined,
        closedAt: dto.closedAt ? new Date(dto.closedAt) : undefined,
      },
      include: this.caseInclude,
    });
  }

  async updateAssignments(user: AuthUser, id: string, dto: UpdateCaseAssignmentsDto) {
    const legalCase = await this.prisma.case.findFirst({
      where: { id, firmId: user.firmId },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const buddyIds = [
      ...new Set(dto.buddyIds.filter((uid) => uid !== legalCase.leadLawyerId)),
    ];

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

    return this.prisma.case.findUnique({ where: { id }, include: this.caseInclude });
  }

  async close(user: AuthUser, id: string, dto: CloseCaseDto) {
    const legalCase = await this.findOne(user, id);
    if (legalCase.status === CaseStatus.CLOSED) {
      throw new BadRequestException('คดีนี้ปิดแล้ว');
    }

    const now = new Date();
    const closed = await this.prisma.case.update({
      where: { id },
      data: {
        status: CaseStatus.CLOSED,
        closedAt: now,
        closingSummary: dto.closingSummary.trim(),
      },
      include: this.caseInclude,
    });

    await this.prisma.caseActivity.create({
      data: {
        caseId: id,
        title: 'ปิดคดี / Case Closed',
        description: dto.closingSummary.trim(),
        activityAt: now,
        type: ActivityType.NOTE,
        createdById: user.id,
      },
    });

    return closed;
  }

  async reopen(user: AuthUser, id: string) {
    const legalCase = await this.findOne(user, id);
    if (legalCase.status !== CaseStatus.CLOSED) {
      throw new BadRequestException('คดีนี้ยังไม่ได้ปิด');
    }

    return this.prisma.case.update({
      where: { id },
      data: {
        status: CaseStatus.IN_PROGRESS,
        closedAt: null,
      },
      include: this.caseInclude,
    });
  }

  async remove(user: AuthUser, id: string) {
    if (user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Only owners can delete cases');
    }
    await this.findOne(user, id);
    await this.prisma.case.delete({ where: { id } });
    return { deleted: true };
  }
}
