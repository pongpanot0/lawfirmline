'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState<string | undefined>();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.forgotPassword(email);
    setSent(true);
    setResetToken(res.resetToken);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-xl font-semibold">Forgot password</h1>
          {sent ? (
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>If that email exists, we sent reset instructions.</p>
              {resetToken && (
                <p className="rounded bg-muted p-2 text-xs break-all">
                  Dev reset link: <Link href={`/reset-password?token=${resetToken}`} className="text-primary underline">Reset password</Link>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
              </div>
              <Button type="submit" className="w-full">Send reset link</Button>
            </form>
          )}
          <Link href="/login" className="mt-4 block text-center text-sm text-primary hover:underline">Back to sign in</Link>
        </CardContent>
      </Card>
    </div>
  );
}
