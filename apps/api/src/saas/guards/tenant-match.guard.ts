import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { TenantRequest } from '../middleware/tenant-resolve.middleware';

/**
 * When a firm slug is present on the request, the authenticated user's firm
 * must match. Apex (no slug) and unauthenticated requests skip this check.
 */
@Injectable()
export class TenantMatchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<TenantRequest & { user?: AuthUser }>();
    if (!req.resolvedFirmId || !req.user) return true;

    if (req.user.firmId !== req.resolvedFirmId) {
      throw new ForbiddenException('You do not belong to this firm');
    }
    return true;
  }
}
