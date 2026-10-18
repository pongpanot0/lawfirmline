import { ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { FirmRole, SUBSCRIPTION_INACTIVE, subscriptionAllowsWrites } from '@lawfirm/shared';
import { ALLOW_EXTERNAL_KEY } from '../decorators/allow-external.decorator';
import { SKIP_SUBSCRIPTION_KEY } from '../../saas/decorators/saas.decorators';
import { assertTenantMatch } from '../../saas/tenant-match';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Staff JWT guard. A freelancer (FirmRole.EXTERNAL) is a staff-token holder
 * too, so deny-by-default lives here: once the token is verified, an EXTERNAL
 * user only passes routes marked @AllowExternal(). On a firm subdomain the
 * user's firm must also match it.
 *
 * Subscription gate lives here too (global guards run before req.user exists):
 * an EXPIRED/CANCELED firm is read-only — writes get 402 unless the route is
 * marked @SkipSubscription() (auth, billing, devices...).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = (await super.canActivate(context)) as boolean;
    const req = context.switchToHttp().getRequest();
    if (authenticated) assertTenantMatch(req);
    const user = req.user;
    if (authenticated && user?.firmRole === FirmRole.EXTERNAL) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_EXTERNAL_KEY, [context.getHandler(), context.getClass()]);
      if (!allowed) throw new ForbiddenException('บัญชีผู้รับงานภายนอกใช้ได้เฉพาะหน้างานของตัวเอง');
    }
    if (authenticated && user?.subscriptionStatus && !READ_METHODS.has(req.method) && !subscriptionAllowsWrites(user.subscriptionStatus)) {
      const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [context.getHandler(), context.getClass()]);
      if (!skip) {
        throw new HttpException(
          { statusCode: HttpStatus.PAYMENT_REQUIRED, code: SUBSCRIPTION_INACTIVE, message: 'สำนักงานอยู่ในโหมดดูอย่างเดียว · การใช้งานหมดอายุแล้ว' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }
    return authenticated;
  }
}
