import { Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class CaseAccessService {
  constructor(private prisma: PrismaService) {}

  async canAccessCase(user: AuthUser, caseId: string): Promise<boolean> {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, ...this.getCaseFilterForUser(user) },
      select: { id: true },
    });
    return !!legalCase;
  }

  getCaseFilterForUser(user: AuthUser): Prisma.CaseWhereInput {
    const tenantFilter = { firmId: user.firmId };

    if (user.firmRole === FirmRole.OWNER) {
      return tenantFilter;
    }

    const staffedOrAssigned: Prisma.CaseWhereInput[] = [
      { leadLawyerId: user.id },
      { assignments: { some: { userId: user.id } } },
      { tasks: { some: { assigneeId: user.id } } },
    ];

    if (user.firmRole === FirmRole.SENIOR_LAWYER) {
      return {
        ...tenantFilter,
        OR: [
          ...staffedOrAssigned,
          {
            leadLawyer: {
              firmMembers: { some: { firmId: user.firmId, role: FirmRole.LAWYER } },
            },
          },
          {
            assignments: {
              some: {
                user: {
                  firmMembers: { some: { firmId: user.firmId, role: FirmRole.LAWYER } },
                },
              },
            },
          },
        ],
      };
    }

    return { ...tenantFilter, OR: staffedOrAssigned };
  }

  getCaseFilterForFinancials(user: AuthUser): Prisma.CaseWhereInput {
    if (user.firmRole === FirmRole.OWNER) {
      return { firmId: user.firmId };
    }

    return {
      firmId: user.firmId,
      OR: [
        { leadLawyerId: user.id },
        { assignments: { some: { userId: user.id } } },
        { tasks: { some: { assigneeId: user.id } } },
      ],
    };
  }

  getTaskFilterForUser(user: AuthUser): Prisma.TaskWhereInput {
    if (user.firmRole === FirmRole.OWNER) {
      return {};
    }

    if (user.firmRole === FirmRole.SENIOR_LAWYER) {
      return {
        OR: [
          { assigneeId: user.id },
          {
            assignee: {
              firmMembers: { some: { firmId: user.firmId, role: FirmRole.LAWYER } },
            },
          },
          { assigneeId: null },
        ],
      };
    }

    return { OR: [{ assigneeId: user.id }, { assigneeId: null }] };
  }
}
