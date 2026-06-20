import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { CaseAccessService } from '../services/case-access.service';

@Injectable()
export class CaseAccessGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const caseId =
      request.params.caseId ?? request.params.id ?? request.body?.caseId;

    if (!caseId) {
      return true;
    }

    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
    });
    if (!legalCase) {
      throw new NotFoundException('Case not found');
    }

    const hasAccess = await this.caseAccess.canAccessCase(user, caseId);
    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to this case');
    }

    request.case = legalCase;
    return true;
  }
}
