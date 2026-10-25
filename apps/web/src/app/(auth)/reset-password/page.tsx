'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { AuthShell } from '@/components/auth/AuthShell';
import { useDashboardT } from '@/components/landing/LocaleProvider';

function ResetForm() {
  const d = useDashboardT();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      // An expired or already-used link is the common case here, and it used
      // to leave the button inert with nothing said.
      setError(d.auth.resetFailed);
      setSaving(false);
    }
  };

  if (!token) {
    return <p role="alert" className="text-sm text-destructive">{d.auth.invalidResetLink}</p>;
  }

  return done ? (
    <p role="status" className="text-sm text-muted-foreground">{d.auth.resetDone}</p>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="text-sm font-medium">{d.auth.newPassword}</label>
        <PasswordInput id="new-password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'new-password-hint new-password-error' : 'new-password-hint'} className="mt-1" />
        <p id="new-password-hint" className="mt-1.5 text-xs text-muted-foreground">{d.auth.passwordHint}</p>
        {error && <p id="new-password-error" role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" className="h-11 w-full" disabled={saving}>
        {saving ? d.auth.resetSaving : d.auth.resetPassword}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const d = useDashboardT();
  return (
    <AuthShell title={d.auth.resetTitle} description={d.auth.resetSubtitle}>
      <Suspense><ResetForm /></Suspense>
      <p className="mt-6 border-t pt-5 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">{d.auth.backToSignIn}</Link>
      </p>
    </AuthShell>
  );
}
