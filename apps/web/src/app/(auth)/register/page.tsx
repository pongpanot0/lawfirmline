'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DEFAULT_ROOT_DOMAIN } from '@lawfirm/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getBrowserFirmSlug, redirectToFirmApp } from '@/lib/firm-slug';
import { AuthShell } from '@/components/auth/AuthShell';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function RegisterPage() {
  const d = useDashboardT();
  const router = useRouter();
  const { applySession, user, loading } = useAuth();
  const [form, setForm] = useState({ firmName: '', firstName: '', lastName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mainSite, setMainSite] = useState('');
  const busy = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (getBrowserFirmSlug()) {
      const local = window.location.hostname.endsWith('.localhost');
      setMainSite(local ? `${window.location.protocol}//localhost:${window.location.port}/register` : `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? DEFAULT_ROOT_DOMAIN}/register`);
    }
    if (!loading && user && !busy.current) router.replace('/dashboard');
  }, [loading, user, router]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setError('');
    try {
      const res = await api.register({ ...form, firmName: form.firmName.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim().toLowerCase() });
      if (redirectToFirmApp(res.user, res)) return;
      applySession(res.accessToken, res.refreshToken, res.user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? d.auth.emailTaken : d.auth.registerFailed);
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AuthShell title={d.auth.registerTitle} description={d.auth.registerSubtitle}>
      {mainSite ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{d.auth.mainSiteRegistration}</p>
          <a href={mainSite} className="block text-sm font-medium text-primary underline">{d.auth.openMainSite}</a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={submitting}>
          <div>
            <label htmlFor="firmName" className="text-sm font-medium">{d.auth.firmName}</label>
            <Input id="firmName" name="organization" autoComplete="organization" required minLength={2} maxLength={200} pattern={'.*\\S.*\\S.*'} className="mt-1 h-11" placeholder={d.auth.firmPlaceholder} value={form.firmName} onChange={e => setForm({ ...form, firmName: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="text-sm font-medium">{d.auth.firstName}</label>
              <Input id="firstName" autoComplete="given-name" required minLength={2} maxLength={100} pattern={'.*\\S.*\\S.*'} className="mt-1 h-11" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lastName" className="text-sm font-medium">{d.auth.lastName}</label>
              <Input id="lastName" autoComplete="family-name" required minLength={2} maxLength={100} pattern={'.*\\S.*\\S.*'} className="mt-1 h-11" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label htmlFor="email" className="text-sm font-medium">{d.auth.email}</label>
            <Input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required className="mt-1 h-11" placeholder="you@example.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">{d.auth.password}</label>
            <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={6} aria-describedby="password-hint" className="mt-1" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <p id="password-hint" className="mt-1.5 text-xs text-muted-foreground">{d.auth.passwordHint}</p>
          </div>
          {error && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-11 w-full" disabled={loading || submitting}>{submitting ? d.auth.creatingFirm : d.auth.createFirm}</Button>
          <p className="text-center text-xs text-muted-foreground">{d.auth.trialNote}</p>
        </form>
      )}
      <p className="mt-6 border-t pt-5 text-center text-sm text-muted-foreground">{d.auth.haveAccount} <Link href="/login" className="font-medium text-primary hover:underline">{d.auth.signIn}</Link></p>
      <p className="mt-3 text-center text-xs leading-relaxed text-muted-foreground">{d.auth.needAccess}</p>
    </AuthShell>
  );
}
