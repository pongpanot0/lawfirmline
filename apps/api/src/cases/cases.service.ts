import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AssignmentType, AuthUser, Role } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CreateCaseDto, UpdateCaseDto, CaseQueryDto } from './dto/case.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  private caseInclude = {
    leadLawyer: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    caseType: { select: { id: true, name: true } },
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
      const searchFilter: Prisma.CaseWhereInput = {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { caseNumber: { contains: query.search, mode: 'insensitive' } },
          { clientName: { contains: query.search, mode: 'insensitive' } },
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
        calendarEvents: { orderBy: { startAt: 'asc' }, take: 5 },
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

  async create(user: AuthUser, dto: CreateCaseDto) {
    if (user.role === Role.CLERK) {
      throw new ForbiddenException('Clerks cannot create cases');
    }

    const existing = await this.prisma.case.findUnique({
      where: { caseNumber: dto.caseNumber },
    });
    if (existing) throw new ConflictException('Case number already exists');

    const assignments: Prisma.CaseAssignmentCreateWithoutCaseInput[] = [];

    for (const userId of dto.coCounselIds ?? []) {
      assignments.push({
        user: { connect: { id: userId } },
        assignmentType: AssignmentType.CO_COUNSEL,
      });
    }
    for (const userId of dto.clerkIds ?? []) {
      assignments.push({
        user: { connect: { id: userId } },
        assignmentType: AssignmentType.CLERK,
      });
    }

    return this.prisma.case.create({
      data: {
        caseNumber: dto.caseNumber,
        folderId: this.generateFolderId(),
        title: dto.title,
        description: dto.description,
        clientName: dto.clientName,
        courtName: dto.courtName,
        customFields: dto.customFields as Prisma.InputJsonValue,
        status: dto.status,
        caseType: dto.caseTypeId
          ? { connect: { id: dto.caseTypeId } }
          : undefined,
        leadLawyer: { connect: { id: dto.leadLawyerId } },
        assignments: assignments.length ? { create: assignments } : undefined,
      },
      include: this.caseInclude,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCaseDto) {
    await this.findOne(user, id);
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

  async remove(user: AuthUser, id: string) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can delete cases');
    }
    await this.findOne(user, id);
    await this.prisma.case.delete({ where: { id } });
    return { deleted: true };
  }
}
