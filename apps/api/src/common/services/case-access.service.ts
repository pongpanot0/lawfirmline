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
    // Task ไม่มี firmId ตรง ๆ — scope ผ่านคดีของ firm หรือ (task ลอย) ผู้สร้างที่เป็นสมาชิก firm
    const firmScope: Prisma.TaskWhereInput = {
      OR: [
        { case: { firmId: user.firmId } },
        {
          caseId: null,
          createdBy: { firmMembers: { some: { firmId: user.firmId } } },
        },
      ],
    };

    if (user.firmRole === FirmRole.OWNER) {
      return firmScope;
    }

    if (user.firmRole === FirmRole.SENIOR_LAWYER) {
      return {
        AND: [
          firmScope,
          {
            OR: [
              { assigneeId: user.id },
              {
                assignee: {
                  firmMembers: { some: { firmId: user.firmId, role: FirmRole.LAWYER } },
                },
              },
              { assigneeId: null },
            ],
          },
        ],
      };
    }

    return {
      AND: [firmScope, { OR: [{ assigneeId: user.id }, { assigneeId: null }] }],
    };
  }

  /** Clients visible when the user owns the firm or has a visible case on them. */
  getClientFilterForUser(user: AuthUser): Prisma.ClientWhereInput {
    if (user.firmRole === FirmRole.OWNER) {
      return { firmId: user.firmId };
    }

    return {
      firmId: user.firmId,
      cases: { some: this.getCaseFilterForUser(user) },
    };
  }

  async getIntakeFilterForUser(user: AuthUser): Promise<Prisma.IntakeWhereInput> {
    const tenantFilter = { firmId: user.firmId };
    if (user.firmRole === FirmRole.OWNER) {
      return tenantFilter;
    }

    const ownOrRelated: Prisma.IntakeWhereInput[] = [
      { receivedById: user.id },
      { assignedUserIds: { has: user.id } },
      { relatedCase: this.getCaseFilterForUser(user) },
    ];

    if (user.firmRole === FirmRole.SENIOR_LAWYER) {
      const lawyers = await this.prisma.firmMember.findMany({
        where: { firmId: user.firmId, role: FirmRole.LAWYER },
        select: { userId: true },
      });
      const lawyerIds = lawyers.map((m) => m.userId);
      return {
        ...tenantFilter,
        OR: [
          ...ownOrRelated,
          ...(lawyerIds.length
            ? [
                { assignedUserIds: { hasSome: lawyerIds } },
                { receivedById: { in: lawyerIds } },
              ]
            : []),
        ],
      };
    }

    return { ...tenantFilter, OR: ownOrRelated };
  }

  async getEmailThreadFilterForUser(user: AuthUser): Promise<Prisma.EmailThreadWhereInput> {
    const tenantFilter = { firmId: user.firmId };
    if (user.firmRole === FirmRole.OWNER || user.firmRole === FirmRole.SENIOR_LAWYER) {
      return tenantFilter;
    }

    const intakeFilter = await this.getIntakeFilterForUser(user);
    return {
      ...tenantFilter,
      intake: intakeFilter,
    };
  }
}
