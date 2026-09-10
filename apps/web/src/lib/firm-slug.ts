import {
  DEFAULT_ROOT_DOMAIN,
  buildFirmAppOrigin,
  extractFirmSlugFromHost,
  needsFirmHostRedirect,
} from '@lawfirm/shared';
import type { AuthUser } from '@lawfirm/shared';

function rootDomain(): string {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
}

/** Resolve the current browser firm slug (subdomain) for API tenant headers. */
export function getBrowserFirmSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return extractFirmSlugFromHost(window.location.host, rootDomain());
}

export function withFirmSlugHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const slug = getBrowserFirmSlug();
  if (slug) {
    return { ...headers, 'X-Firm-Slug': slug };
  }
  return headers;
}

export function shouldRedirectAfterLogin(currentHost: string, firmSlug: string): boolean {
  return needsFirmHostRedirect(currentHost, firmSlug, rootDomain());
}

export function buildFirmHandoffUrl(opts: {
  firmSlug: string;
  currentHost: string;
  protocol: string;
  accessToken: string;
  refreshToken: string;
  nextPath?: string;
}): string {
  const origin = buildFirmAppOrigin({
    firmSlug: opts.firmSlug,
    currentHost: opts.currentHost,
    protocol: opts.protocol,
    rootDomain: rootDomain(),
  });
  const hash = new URLSearchParams({
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken,
    next: opts.nextPath ?? '/dashboard',
  }).toString();
  return `${origin}/handoff#${hash}`;
}

/**
 * After login on apex/www, move the session onto the firm subdomain.
 * Returns true when a cross-origin redirect was started.
 */
export function redirectToFirmApp(
  user: Pick<AuthUser, 'firmSlug'>,
  tokens: { accessToken: string; refreshToken: string },
  nextPath = '/dashboard',
): boolean {
  if (typeof window === 'undefined') return false;
  if (!user.firmSlug || !shouldRedirectAfterLogin(window.location.host, user.firmSlug)) {
    return false;
  }
  window.location.assign(
    buildFirmHandoffUrl({
      firmSlug: user.firmSlug,
      currentHost: window.location.host,
      protocol: window.location.protocol,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      nextPath,
    }),
  );
  return true;
}
