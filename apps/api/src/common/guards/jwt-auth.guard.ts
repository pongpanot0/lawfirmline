import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirmRole } from '@lawfirm/shared';
import { ALLOW_EXTERNAL_KEY } from '../decorators/allow-external.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, status: any, context: ExecutionContext) {
    const result = super.handleRequest(err, user, info, status);
    if (!result) return result;

    // Check if user is EXTERNAL and if the handler/class allows it
    if (result.firmRole === FirmRole.EXTERNAL) {
      const isAllowed = this.reflector.getAllAndOverride<boolean>(ALLOW_EXTERNAL_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!isAllowed) {
        throw new ForbiddenException('บัญชีผู้รับงานภายนอกใช้ได้เฉพาะหน้างานของตัวเอง');
      }
    }

    return result;
  }
}
