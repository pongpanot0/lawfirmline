export const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'samnuan.com';
export const siteUrl = `https://${rootDomain}`;

export function classifySeoHost(host: string | null, root = rootDomain) {
  const hostname = (host ?? '').trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (hostname === root.toLowerCase().replace(/\.$/, '')) return 'apex';
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '[::1]') {
    return 'development';
  }
  return 'other';
}

export const privatePaths = [
  '/api/', '/login', '/forgot-password', '/reset-password', '/invite', '/handoff',
  '/oauth', '/portal', '/superadmin', '/outlook-addin',
  '/account', '/admin', '/ai-usage', '/brief', '/calendar', '/cases', '/clients',
  '/coaching', '/court-day', '/court-schedule', '/dashboard', '/documents',
  '/email-intake', '/email-search', '/expenses', '/f/', '/getting-started',
  '/import', '/intake', '/invoices', '/knowledge', '/leaves', '/my-day',
  '/operations', '/playbooks', '/reports', '/research', '/settings', '/sops',
  '/team', '/timesheet', '/todos', '/work', '/workflows',
];

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
