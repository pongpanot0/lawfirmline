'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';

/** Verify the destination tenant and update React auth state before navigating. */
export default function HandoffPage() {
  const router = useRouter();
  const { applySession } = useAuth();
  const d = useDashboardT();
  const { setLocale } = useLocale();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Strict Mode replays effects; the first pass has already removed the hash.
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const next = params.get('next') || '/dashboard';
    window.history.replaceState(null, '', window.location.pathname);
    if (!accessToken || !refreshToken) {
      setFailed(true);
      return;
    }
    // An incoming handoff must stand on its own, never refresh as a previous user.
    void api.getMe(accessToken, { refreshAuth: false }).then(user => {
      const locale = params.get('locale');
      if (locale === 'th' || locale === 'en') setLocale(locale);
      applySession(accessToken, refreshToken, user);
      const destination = new URL(next, window.location.origin);
      router.replace(destination.origin === window.location.origin && destination.pathname !== '/handoff'
        ? `${destination.pathname}${destination.search}${destination.hash}` : '/dashboard');
    }).catch(() => setFailed(true));
  }, [applySession, router, setLocale]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      {failed ? <div className="space-y-4 text-center">
        <p role="alert" className="text-sm text-destructive">{d.auth.handoffFailed}</p>
        <Link href="/login" className="text-sm font-medium text-primary underline">{d.auth.backToSignIn}</Link>
      </div> : <p role="status" className="text-sm text-muted-foreground">{d.auth.signingIn}</p>}
    </main>
  );
}
