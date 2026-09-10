import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_ROOT_DOMAIN,
  extractFirmSlugFromHost,
  isReservedFirmSlug,
} from '@lawfirm/shared';

const FIRM_SLUG_HEADER = 'x-firm-slug';

export function middleware(request: NextRequest) {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN;
  const host = request.headers.get('host');
  const slug = extractFirmSlugFromHost(host, rootDomain);

  const requestHeaders = new Headers(request.headers);
  if (slug) {
    requestHeaders.set(FIRM_SLUG_HEADER, slug);
  } else {
    requestHeaders.delete(FIRM_SLUG_HEADER);
  }

  // Reserved / unknown tenant hosts should not serve the app shell as a firm.
  const hostname = host?.split(':')[0]?.toLowerCase() ?? '';
  const root = rootDomain.toLowerCase();
  if (
    hostname.endsWith(`.${root}`) &&
    !slug &&
    hostname !== `www.${root}` &&
    hostname !== `api.${root}`
  ) {
    const sub = hostname.slice(0, -(root.length + 1));
    if (sub && isReservedFirmSlug(sub)) {
      return NextResponse.redirect(new URL(`https://${root}`, request.url));
    }
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
