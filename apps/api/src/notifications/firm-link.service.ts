import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildFirmAppOrigin, DEFAULT_ROOT_DOMAIN } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

/**
 * Deep links sent outside the browser (LINE pushes, emails) have no request to
 * read the host from, and the app resolves the tenant from the subdomain — so a
 * link to the bare root domain lands on a page with no firm. Every such link is
 * built here, from the firm's own slug.
 */
@Injectable()
export class FirmLinkService {
  private readonly logger = new Logger(FirmLinkService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /** Origin of the firm's app, e.g. https://thesiambarristers.samnuan.com */
  async originForFirm(firmId: string): Promise<string> {
    const base = this.baseUrl();
    const firm = await this.prisma.firm.findUnique({
      where: { id: firmId },
      select: { slug: true },
    });
    if (!firm) {
      // Better a working root link than a thrown error inside a notification.
      this.logger.warn(`No firm ${firmId}; falling back to ${base.origin}`);
      return base.origin;
    }
    return this.originForSlug(firm.slug, base);
  }

  /** Same, when the caller already holds the slug (e.g. from AuthUser). */
  originForSlug(firmSlug: string, base = this.baseUrl()): string {
    return buildFirmAppOrigin({
      firmSlug,
      currentHost: base.host,
      protocol: base.protocol,
      rootDomain: this.config.get<string>('ROOT_DOMAIN') ?? DEFAULT_ROOT_DOMAIN,
    });
  }

  /** The app root, with no tenant — only for flows that do not know the firm yet. */
  rootOrigin(): string {
    return this.baseUrl().origin;
  }

  /** Full link to a path inside the firm's app. */
  async linkFor(firmId: string, entityPath: string): Promise<string> {
    return `${await this.originForFirm(firmId)}${entityPath}`;
  }

  /**
   * APP_URL is what deployments already set; WEB_APP_URL stays supported for
   * local overrides. Both carry the root origin — the slug is added on top.
   */
  private baseUrl(): URL {
    const raw =
      this.config.get<string>('APP_URL') ??
      this.config.get<string>('WEB_APP_URL') ??
      'http://localhost:3000';
    try {
      return new URL(raw);
    } catch {
      this.logger.warn(`APP_URL/WEB_APP_URL is not a URL: ${raw}`);
      return new URL('http://localhost:3000');
    }
  }
}
