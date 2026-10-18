import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { assertTenantMatch } from '../saas/tenant-match';

@Injectable()
export class ClientPortalGuard extends AuthGuard('client-portal-jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    if (authenticated) assertTenantMatch(context.switchToHttp().getRequest());
    return authenticated;
  }
}
