'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { redirectToFirmApp } from '@/lib/firm-slug';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export default function InvitePage() {
  const d = useDashboardT();
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();
  const { applySession } = useAuth();
  const [info, setInfo] = useState<{ email: string; firmName: string } | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '' });
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    api.getInvitation(token).then(setInfo).catch(() => setError(d.auth.inviteInvalid));
  }, [token, d.auth.inviteInvalid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joining) return;
    setJoining(true);
    setError('');
    try {
      const res = await api.acceptInvitation({ token, ...form });
      if (redirectToFirmApp(res.user, res)) return;
      applySession(res.accessToken, res.refreshToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : d.auth.inviteFailed);
      setJoining(false);
    }
  };

  const description = info
    ? fmt(d.auth.inviteJoin, { firm: info.firmName, email: info.email })
    : error ? d.auth.inviteInvalid : d.auth.inviteLoading;

  return (
    <AuthShell title={d.auth.inviteTitle} description={description}>
      {!info ? (
        error ? (
          <p className="text-sm">
            <Link href="/login" className="font-medium text-primary hover:underline">{d.auth.backToSignIn}</Link>
          </p>
        ) : (
          <p role="status" className="sr-only">{d.auth.inviteLoading}</p>
        )
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="invite-first-name" className="text-sm font-medium">{d.auth.firstName}</label>
              <Input id="invite-first-name" required minLength={2} autoComplete="given-name" className="mt-1 h-11" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="invite-last-name" className="text-sm font-medium">{d.auth.lastName}</label>
              <Input id="invite-last-name" required minLength={2} autoComplete="family-name" className="mt-1 h-11" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="invite-password" className="text-sm font-medium">{d.auth.password}</label>
            <PasswordInput id="invite-password" required autoComplete="new-password" minLength={6} aria-describedby="invite-password-hint" className="mt-1" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p id="invite-password-hint" className="mt-1.5 text-xs text-muted-foreground">{d.auth.passwordHint}</p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={joining}>
            {joining ? d.auth.joining : d.auth.joinFirm}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
