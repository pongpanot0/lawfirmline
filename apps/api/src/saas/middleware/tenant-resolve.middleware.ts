import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  DEFAULT_ROOT_DOMAIN,
  extractFirmSlugFromHost,
  isReservedFirmSlug,
} from '@lawfirm/shared';
import { TenantService } from '../tenant.service';

export const FIRM_SLUG_HEADER = 'x-firm-slug';

export type TenantRequest = Request & {
  firmSlug?: string | null;
  resolvedFirmId?: string | null;
};

@Injectable()
export class TenantResolveMiddleware implements NestMiddleware {
  constructor(private tenant: TenantService) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    const rootDomain = process.env.ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
    const headerSlug = (req.headers[FIRM_SLUG_HEADER] as string | undefined)?.trim().toLowerCase();
    const hostSlug = extractFirmSlugFromHost(req.headers.host, rootDomain);
    const slug = headerSlug || hostSlug || null;

    req.firmSlug = slug;
    req.resolvedFirmId = null;

    if (!slug) {
      return next();
    }

    if (isReservedFirmSlug(slug)) {
      throw new BadRequestException('Invalid firm URL');
    }

    const firm = await this.tenant.findBySlug(slug);
    if (!firm) {
      throw new NotFoundException('Firm not found for this URL');
    }

    req.resolvedFirmId = firm.id;
    return next();
  }
}
