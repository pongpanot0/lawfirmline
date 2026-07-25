import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PortalIdentity } from './client-portal-jwt.strategy';

export const CurrentPortalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalIdentity => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
