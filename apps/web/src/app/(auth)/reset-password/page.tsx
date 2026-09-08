'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

function ResetForm() {
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
      setError(err instanceof Error ? err.message : 'Could not reset the password. The link may have expired.');
      setSaving(false);
    }
  };

  if (!token) {
    return <p className="text-destructive">Invalid reset link</p>;
  }

  return done ? (
    <p className="text-sm text-muted-foreground">Password updated. Redirecting to login...</p>
  ) : (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div>
        <label className="text-sm font-medium">New password</label>
        <Input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? 'Saving...' : 'Reset password'}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-xl font-semibold">Reset password</h1>
          <Suspense><ResetForm /></Suspense>
          <Link href="/login" className="mt-4 block text-center text-sm text-primary hover:underline">Back to sign in</Link>
        </CardContent>
      </Card>
    </div>
  );
}
