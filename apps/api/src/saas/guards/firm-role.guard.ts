import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirmRole } from '@lawfirm/shared';
import { FIRM_ROLES_KEY, OWNER_ONLY_KEY } from '../decorators/saas.decorators';

@Injectable()
export class FirmRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<FirmRole[]>(FIRM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ownerOnly = this.reflector.getAllAndOverride<boolean>(OWNER_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new UnauthorizedException();

    if (ownerOnly && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Owner access required');
    }

    if (requiredRoles?.length && !requiredRoles.includes(user.firmRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
