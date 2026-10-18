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

const HANDOFF_PATH = '/handoff';

/**
 * The handoff page establishes the session itself; validating a stale stored
 * token there would 401, fail to refresh and clear the tokens the handoff just saved.
 */
export function isHandoffPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === HANDOFF_PATH;
}

export function buildFirmHandoffUrl(opts: {
  firmSlug: string;
  currentHost: string;
  protocol: string;
  accessToken: string;
  refreshToken: string;
  nextPath?: string;
  locale?: string | null;
}): string {
  const origin = buildFirmAppOrigin({
    firmSlug: opts.firmSlug,
    currentHost: opts.currentHost,
    protocol: opts.protocol,
    rootDomain: rootDomain(),
  });
  const params = new URLSearchParams({
    access_token: opts.accessToken,
    refresh_token: opts.refreshToken,
    next: opts.nextPath ?? '/dashboard',
  });
  if (opts.locale === 'th' || opts.locale === 'en') params.set('locale', opts.locale);
  return `${origin}${HANDOFF_PATH}#${params.toString()}`;
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
      locale: localStorage.getItem('samnuan_locale'),
    }),
  );
  return true;
}
