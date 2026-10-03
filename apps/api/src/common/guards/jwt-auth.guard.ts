import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { FirmRole } from '@lawfirm/shared';
import { ALLOW_EXTERNAL_KEY } from '../decorators/allow-external.decorator';

/**
 * Staff JWT guard. A freelancer (FirmRole.EXTERNAL) is a staff-token holder
 * too, so deny-by-default lives here: once the token is verified, an EXTERNAL
 * user only passes routes marked @AllowExternal().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    const user = context.switchToHttp().getRequest().user;
    if (authenticated && user?.firmRole === FirmRole.EXTERNAL) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_EXTERNAL_KEY, [context.getHandler(), context.getClass()]);
      if (!allowed) throw new ForbiddenException('บัญชีผู้รับงานภายนอกใช้ได้เฉพาะหน้างานของตัวเอง');
    }
    return authenticated;
  }
}
