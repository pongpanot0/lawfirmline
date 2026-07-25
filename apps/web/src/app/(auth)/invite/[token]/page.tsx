'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<{ email: string; firmName: string } | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', password: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.getInvitation(token).then(setInfo).catch(() => setError('Invitation expired or invalid'));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.acceptInvitation({ token, ...form });
      localStorage.setItem('lawfirm_access_token', res.accessToken);
      localStorage.setItem('lawfirm_refresh_token', res.refreshToken);
      router.push('/dashboard');
    } catch {
      setError('Failed to accept invitation');
    }
  };

  if (error) return <p className="text-destructive">{error}</p>;
  if (!info) return <p className="text-muted-foreground">Loading invitation...</p>;

  return (
    <>
      <p className="mt-2 text-sm text-muted-foreground">
        Join <strong>{info.firmName}</strong> as {info.email}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input required placeholder="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input required placeholder="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <Input required type="password" minLength={6} placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" className="w-full">Join firm</Button>
      </form>
    </>
  );
}

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-xl font-semibold">Accept invitation</h1>
          <Suspense fallback={<p>Loading...</p>}>
            <InviteForm token={token} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
