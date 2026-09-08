'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';

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
      const res = await api.forgotPassword(email);
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher />
          </div>
          <h1 className="text-xl font-semibold">{d.auth.forgotTitle}</h1>
          {sent ? (
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>{d.auth.resetLinkSent}</p>
              {resetToken && (
                <p className="rounded bg-muted p-2 text-xs break-all">
                  {d.auth.devResetLink} <Link href={`/reset-password?token=${resetToken}`} className="text-primary underline">{d.auth.resetPassword}</Link>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">{d.auth.email}</label>
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={sending}>
                {sending ? d.auth.sending : d.auth.sendResetLink}
              </Button>
            </form>
          )}
          <Link href="/login" className="mt-4 block text-center text-sm text-primary hover:underline">{d.auth.backToSignIn}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
