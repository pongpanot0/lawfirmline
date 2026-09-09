'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';

const AUTH_ONLY_PREFIXES = [
  '/portal/login',
  '/portal/check-email',
  '/portal/verify',
  '/portal/invite',
  '/portal/set-password',
];

/**
 * Logged-in contacts without a password must finish /portal/set-password
 * before using the rest of the portal.
 */
export function PortalPasswordGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { contact, loading } = usePortalAuth();

  const isAuthOnly = AUTH_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    if (loading || isAuthOnly) return;
    if (contact && !contact.hasPassword) {
      router.replace('/portal/set-password');
    }
  }, [loading, isAuthOnly, contact, router]);

  if (!loading && contact && !contact.hasPassword && !isAuthOnly) {
    return null;
  }

  return <>{children}</>;
}
