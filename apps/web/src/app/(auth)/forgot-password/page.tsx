'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/components/auth/AuthShell';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function ForgotPasswordPage() {
  const d = useDashboardT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError('');
    try {
      const res = await api.forgotPassword(email.trim());
      setSent(true);
      setResetToken(res.resetToken);
    } catch (err) {
      // Without this the button simply did nothing on failure, and someone
      // locked out of their account had no way to tell.
      setError(err instanceof Error ? err.message : d.auth.sendResetFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthShell title={d.auth.forgotTitle} description={d.auth.forgotSubtitle}>
      {sent ? (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p role="status">{d.auth.resetLinkSent}</p>
          {resetToken && (
            <p className="rounded bg-muted p-2 text-xs break-all">
              {d.auth.devResetLink} <Link href={`/reset-password?token=${resetToken}`} className="text-primary underline">{d.auth.resetPassword}</Link>
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="recovery-email" className="text-sm font-medium">{d.auth.email}</label>
            <Input id="recovery-email" autoComplete="email" autoCapitalize="none" spellCheck={false} required type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? 'recovery-email-error' : undefined} className="mt-1 h-11" />
            {error && <p id="recovery-email-error" role="alert" className="mt-1.5 text-sm text-destructive">{error}</p>}
          </div>
          <Button type="submit" className="h-11 w-full" disabled={sending}>
            {sending ? d.auth.sending : d.auth.sendResetLink}
          </Button>
        </form>
      )}
      <p className="mt-6 border-t pt-5 text-center text-sm">
        <Link href="/login" className="font-medium text-primary hover:underline">{d.auth.backToSignIn}</Link>
      </p>
    </AuthShell>
  );
}
