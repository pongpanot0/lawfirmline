/** Only local destinations may survive login or the firm-subdomain handoff. */
export function loginReturnPath(search: string): string {
  const next = new URLSearchParams(search).get('next');
  if (!next?.startsWith('/') || next.startsWith('//') || /[\\\u0000-\u0020]/.test(next)) return '/dashboard';
  const destination = new URL(next, 'https://samnuan.invalid');
  if (['/login', '/handoff'].includes(destination.pathname.replace(/\/+$/, ''))) return '/dashboard';
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
