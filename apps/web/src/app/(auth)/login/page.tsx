'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';

export default function LoginPage() {
  const d = useDashboardT();
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  if (!loading && user) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      setError(d.auth.invalidCredentials);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-3">
          <SamnuanLogo wordmark={false} markClassName="h-10 w-10 rounded-xl" />
          <span className="text-xl font-bold">Samnuan</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            {d.auth.brandTagline}
          </h1>
          <p className="mt-4 text-lg text-primary-foreground/80">{d.auth.brandBlurb}</p>
        </div>
        <p className="text-sm text-primary-foreground/60">© 2025 Samnuan Legal SaaS</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md border-0 shadow-card">
          <CardContent className="p-8">
            {/*
              The switcher lives here because this is the first screen anyone
              sees: a Thai reader arriving at an English form otherwise has no
              way to change it until after they are signed in.
            */}
            <div className="mb-4 flex justify-end">
              <LanguageSwitcher />
            </div>

            <div className="mb-8 text-center lg:text-left">
              <div className="mb-4 flex items-center justify-center gap-2 lg:justify-start">
                <SamnuanLogo markClassName="h-9 w-9" />
              </div>
              <h2 className="text-xl font-semibold">{d.auth.signInTitle}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{d.auth.signInSubtitle}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">{d.auth.email}</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@lawfirm.com" className="mt-1" required />
              </div>
              <div>
                <label className="text-sm font-medium">{d.auth.password}</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1" required />
              </div>
              <div className="text-right">
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">{d.auth.forgotPassword}</Link>
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? d.auth.signingIn : d.auth.signIn}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              {d.auth.needAccess}
            </p>

            <div className="mt-6 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{d.auth.demoAccounts}</p>
              <ul className="mt-2 space-y-1">
                <li>{d.team.roleOwner}: admin@lawfirm.com</li>
                <li>{d.team.roleLawyer}: lawyer1@lawfirm.com … lawyer4@lawfirm.com</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
