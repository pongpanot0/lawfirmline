import { Injectable } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { TenantService } from '../../saas/tenant.service';

@Injectable()
export class LineAuthContextService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
  ) {}

  async resolve(lineUserId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { lineUserId } });
    if (!user) return null;
    const authUser = await this.tenant.buildAuthUser(user.id);
    // The bot's flows act on staff data (cases, leave, expenses); a freelancer
    // works only through /work, so the bot treats them as not linked.
    return authUser?.firmRole === 'EXTERNAL' ? null : authUser;
  }
}
