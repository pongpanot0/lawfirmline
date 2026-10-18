import { ForbiddenException } from '@nestjs/common';
import type { TenantRequest } from './middleware/tenant-resolve.middleware';

/**
 * On a firm subdomain the authenticated identity's firm must be that firm.
 * Apex requests (no slug) skip this. Called by the auth guards right after the
 * token is verified: a global guard would run before req.user exists.
 */
export function assertTenantMatch(req: TenantRequest & { user?: { firmId?: string } }): void {
  if (req.resolvedFirmId && req.user && req.user.firmId !== req.resolvedFirmId) {
    throw new ForbiddenException('You do not belong to this firm');
  }
}
