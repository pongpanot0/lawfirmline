import { Injectable } from '@nestjs/common';
import { AssignmentType, AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class CaseAccessService {
  constructor(private prisma: PrismaService) {}

  async canAccessCase(user: AuthUser, caseId: string): Promise<boolean> {
    const legalCase = await this.prisma.case.findFirst({
      where: { id: caseId, firmId: user.firmId },
      include: {
        assignments: true,
        tasks: { where: { assigneeId: user.id } },
      },
    });

    if (!legalCase) return false;

    if (user.firmRole === FirmRole.OWNER) return true;

    if (legalCase.leadLawyerId === user.id) return true;

    const coCounsel = legalCase.assignments.some(
      (a) => a.userId === user.id && a.assignmentType === AssignmentType.CO_COUNSEL,
    );
    if (coCounsel) return true;

    const clerk = legalCase.assignments.some(
      (a) => a.userId === user.id && a.assignmentType === AssignmentType.CLERK,
    );
    if (clerk || legalCase.tasks.length > 0) return true;

    return false;
  }

  getCaseFilterForUser(user: AuthUser) {
    const tenantFilter = { firmId: user.firmId };

    if (user.firmRole === FirmRole.OWNER) {
      return tenantFilter;
    }

    return {
      ...tenantFilter,
      OR: [
        { leadLawyerId: user.id },
        {
          assignments: {
            some: { userId: user.id },
          },
        },
        {
          tasks: {
            some: { assigneeId: user.id },
          },
        },
      ],
    };
  }
}
