'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth, REFRESH_KEY } from '@/lib/auth';
import { redirectToFirmApp } from '@/lib/firm-slug';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { api, ApiError } from '@/lib/api';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function LoginPage() {
  const d = useDashboardT();
  const { login, applySession, user, loading, token } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /** Set once the password checks out on an MFA account — the code step replaces the form. */
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (loading || !user) return;
    const refresh =
      typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
    if (token && refresh && redirectToFirmApp(user, { accessToken: token, refreshToken: refresh })) {
      return;
    }
    router.replace('/dashboard');
  }, [user, loading, router, token]);

  if (!loading && user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await login(email.trim().toLowerCase(), password);
      if ('mfaRequired' in res) {
        setMfaToken(res.mfaToken);
        return;
      }
      if (redirectToFirmApp(res.user, res)) {
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? d.auth.invalidCredentials : d.auth.connectionFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await api.verifyMfaLogin(mfaToken, code.trim());
      applySession(res.accessToken, res.refreshToken, res.user);
      if (redirectToFirmApp(res.user, res)) {
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 400 ? d.auth.mfaInvalidCode : d.auth.connectionFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (mfaToken) {
    return (
      <AuthShell title={d.auth.mfaTitle} description={d.auth.mfaSubtitle}>
        <form onSubmit={handleVerifyMfa} className="space-y-4">
          <div>
            <label htmlFor="mfa-code" className="text-sm font-medium">{d.auth.mfaCodeLabel}</label>
            <Input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="mt-1 h-11 text-center text-lg tracking-[0.5em]"
              autoFocus
              required
            />
          </div>
          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={submitting || code.length !== 6}>
            {submitting ? d.auth.mfaVerifying : d.auth.mfaVerify}
          </Button>
          <button
            type="button"
            className="block w-full text-center text-sm text-primary hover:underline"
            onClick={() => { setMfaToken(null); setCode(''); setError(''); }}
          >
            {d.auth.mfaBackToLogin}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={d.auth.signInTitle} description={d.auth.signInSubtitle}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium">{d.auth.email}</label>
                <Input id="email" name="email" autoComplete="username" autoCapitalize="none" spellCheck={false} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 h-11" required />
              </div>
              <div>
                <label htmlFor="password" className="text-sm font-medium">{d.auth.password}</label>
                <PasswordInput id="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1" required />
              </div>
              <div className="text-right">
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">{d.auth.forgotPassword}</Link>
              </div>
              {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full" disabled={submitting || loading}>
                {submitting ? d.auth.signingIn : d.auth.signIn}
              </Button>
            </form>

            <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">
              {d.auth.newFirm}{' '}
              <Link href="/register" className="font-medium text-primary hover:underline">{d.auth.registerLink}</Link>
            </p>
            <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">
              {d.auth.needAccess}
            </p>

            {process.env.NODE_ENV !== 'production' && <div className="mt-6 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{d.auth.demoAccounts}</p>
              <ul className="mt-2 space-y-1">
                <li>{d.team.roleOwner}: admin@lawfirm.com</li>
                <li>{d.team.roleLawyer}: lawyer1@lawfirm.com … lawyer4@lawfirm.com</li>
              </ul>
            </div>}
    </AuthShell>
  );
}
