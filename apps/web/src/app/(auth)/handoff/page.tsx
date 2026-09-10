'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { persistTokens } from '@/lib/auth';

/**
 * Cross-subdomain session handoff.
 * Tokens arrive in the URL hash (not sent to the server) from apex login.
 */
export default function HandoffPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const next = params.get('next') || '/dashboard';

    // Drop tokens from the address bar ASAP.
    window.history.replaceState(null, '', window.location.pathname);

    if (!accessToken || !refreshToken) {
      setError('Session handoff failed. Please sign in again.');
      return;
    }

    persistTokens(accessToken, refreshToken);
    router.replace(next.startsWith('/') ? next : '/dashboard');
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
