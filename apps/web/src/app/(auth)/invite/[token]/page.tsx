'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';
import { fmt } from '@/lib/i18n/dashboard';

function InviteForm({ token }: { token: string }) {
  const d = useDashboardT();
  const router = useRouter();
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
      localStorage.setItem('lawfirm_access_token', res.accessToken);
      localStorage.setItem('lawfirm_refresh_token', res.refreshToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : d.auth.inviteFailed);
      setJoining(false);
    }
  };

  if (error && !info) return <p className="text-destructive">{error}</p>;
  if (!info) return <p className="text-muted-foreground">{d.auth.inviteLoading}</p>;

  return (
    <>
      <p className="mt-2 text-sm text-muted-foreground">
        {fmt(d.auth.inviteJoin, { firm: info.firmName, email: info.email })}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input required placeholder={d.auth.firstName} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          <Input required placeholder={d.auth.lastName} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <Input required type="password" minLength={6} placeholder={d.auth.password} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={joining}>
          {joining ? d.auth.joining : d.auth.joinFirm}
        </Button>
      </form>
    </>
  );
}

export default function InvitePage() {
  const d = useDashboardT();
  const params = useParams();
  const token = params.token as string;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <div className="mb-4 flex justify-end">
            <LanguageSwitcher />
          </div>
          <h1 className="text-xl font-semibold">{d.auth.inviteTitle}</h1>
          <Suspense fallback={<p className="text-muted-foreground">{d.common.loading}</p>}>
            <InviteForm token={token} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
