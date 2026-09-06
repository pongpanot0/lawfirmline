'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

export default function LoginPage() {
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
      setError('Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-primary p-12 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Scale className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold">LexFlow</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Modern case management for Thai law firms
          </h1>
          <p className="mt-4 text-lg text-primary-foreground/80">
            Manage cases, court schedules, documents, and expenses — all in one place.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">© 2025 LexFlow Legal SaaS</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md border-0 shadow-card">
          <CardContent className="p-8">
            <div className="mb-8 text-center lg:text-left">
              <div className="mb-4 flex items-center justify-center gap-2 lg:justify-start">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Scale className="h-4 w-4" />
                </div>
                <span className="text-lg font-bold">LexFlow</span>
              </div>
              <h2 className="text-xl font-semibold">Sign in to your account</h2>
              <p className="mt-1 text-sm text-muted-foreground">Enter your credentials to continue</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@lawfirm.com" className="mt-1" required />
              </div>
              <div>
                <label className="text-sm font-medium">Password</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1" required />
              </div>
              <div className="text-right">
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Need access? Contact your firm administrator to be invited.
            </p>

            <div className="mt-6 rounded-lg bg-muted p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Demo accounts (password: password123)</p>
              <ul className="mt-2 space-y-1">
                <li>Admin: admin@lawfirm.com</li>
                <li>Lawyer: lawyer1@lawfirm.com</li>
                <li>Clerk: clerk1@lawfirm.com</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
