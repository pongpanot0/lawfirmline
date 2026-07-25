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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.resetPassword(token, password);
    setDone(true);
    setTimeout(() => router.push('/login'), 2000);
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
      <Button type="submit" className="w-full">Reset password</Button>
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
