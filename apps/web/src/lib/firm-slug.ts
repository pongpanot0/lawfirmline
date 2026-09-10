import {
  DEFAULT_ROOT_DOMAIN,
  extractFirmSlugFromHost,
} from '@lawfirm/shared';

/** Resolve the current browser firm slug (subdomain) for API tenant headers. */
export function getBrowserFirmSlug(): string | null {
  if (typeof window === 'undefined') return null;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
  return extractFirmSlugFromHost(window.location.host, rootDomain);
}

export function withFirmSlugHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const slug = getBrowserFirmSlug();
  if (slug) {
    return { ...headers, 'X-Firm-Slug': slug };
  }
  return headers;
}
