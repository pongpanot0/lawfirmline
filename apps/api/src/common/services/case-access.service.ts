import { Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
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

    const isBuddy = legalCase.assignments.some((a) => a.userId === user.id);
    if (isBuddy || legalCase.tasks.length > 0) return true;

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
