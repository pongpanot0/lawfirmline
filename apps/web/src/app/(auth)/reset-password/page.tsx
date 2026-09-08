'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';

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
      setError(err instanceof Error ? err.message : d.auth.resetFailed);
      setSaving(false);
    }
  };

  if (!token) {
    return <p className="text-destructive">{d.auth.invalidResetLink}</p>;
  }

  return done ? (
    <p className="text-sm text-muted-foreground">{d.auth.resetDone}</p>
  ) : (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div>
        <label className="text-sm font-medium">{d.auth.newPassword}</label>
        <Input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? d.auth.resetSaving : d.auth.resetPassword}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const d = useDashboardT();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher />
          </div>
          <h1 className="text-xl font-semibold">{d.auth.resetTitle}</h1>
          <Suspense><ResetForm /></Suspense>
          <Link href="/login" className="mt-4 block text-center text-sm text-primary hover:underline">{d.auth.backToSignIn}</Link>
        </CardContent>
      </Card>
    </div>
  );
}
