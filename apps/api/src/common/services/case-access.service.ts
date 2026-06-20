import { Injectable } from '@nestjs/common';
import { AssignmentType, Role } from '@lawfirm/shared';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';

@Injectable()
export class CaseAccessService {
  constructor(private prisma: PrismaService) {}

  async canAccessCase(user: AuthUser, caseId: string): Promise<boolean> {
    if (user.role === Role.ADMIN) {
      return true;
    }

    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      include: {
        assignments: true,
        tasks: { where: { assigneeId: user.id } },
      },
    });

    if (!legalCase) {
      return false;
    }

    if (user.role === Role.LAWYER) {
      if (legalCase.leadLawyerId === user.id) {
        return true;
      }
      return legalCase.assignments.some(
        (a) =>
          a.userId === user.id && a.assignmentType === AssignmentType.CO_COUNSEL,
      );
    }

    if (user.role === Role.CLERK) {
      const hasClerkAssignment = legalCase.assignments.some(
        (a) => a.userId === user.id && a.assignmentType === AssignmentType.CLERK,
      );
      const hasAssignedTask = legalCase.tasks.length > 0;
      return hasClerkAssignment || hasAssignedTask;
    }

    return false;
  }

  getCaseFilterForUser(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      return {};
    }

    if (user.role === Role.LAWYER) {
      return {
        OR: [
          { leadLawyerId: user.id },
          {
            assignments: {
              some: {
                userId: user.id,
                assignmentType: AssignmentType.CO_COUNSEL,
              },
            },
          },
        ],
      };
    }

    if (user.role === Role.CLERK) {
      return {
        OR: [
          {
            assignments: {
              some: {
                userId: user.id,
                assignmentType: AssignmentType.CLERK,
              },
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

    return { id: 'impossible' };
  }
}
