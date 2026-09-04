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
    return this.tenant.buildAuthUser(user.id);
  }
}
