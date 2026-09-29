'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Plus, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { buttonVariants } from '@/components/ui/button';

export default function PlaybooksPage() {
  return <Suspense><PlaybooksList /></Suspense>;
}

function PlaybooksList() {
  const { token, user } = useAuth();
  const { locale } = useLocale();
  const th = locale === 'th';
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<PlaybookRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = params.get('id');
    if (id) { router.replace(`/playbooks/${encodeURIComponent(id)}`); return; }
    if (params.get('new') === '1') { router.replace('/playbooks/new'); return; }
    if (!token) return;
    setupRequest<PlaybookRelease[]>(token, '/playbooks')
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [token, params, router]);

  return <div className="mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Link href="/sops" className="text-sm text-primary">← {th ? 'SOP / คู่มือการทำงาน' : 'SOP library'}</Link>
        <h1 className="mt-2 text-2xl font-semibold">{th ? 'SOP อัตโนมัติ' : 'Automated SOPs'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{th ? 'เลือก SOP ที่ต้องการจัดลำดับและแก้ไขขั้นตอน' : 'Choose an SOP to edit its workflow.'}</p>
      </div>
      {user?.firmRole === 'OWNER' && <Link href="/playbooks/new" className={buttonVariants()}><Plus className="mr-2 h-4 w-4" />{th ? 'สร้าง SOP ใหม่' : 'Create SOP'}</Link>}
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p className="text-sm text-muted-foreground">{th ? 'กำลังโหลด SOP…' : 'Loading SOPs…'}</p> : items.length === 0 ?
      <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{th ? 'ยังไม่มี SOP อัตโนมัติ' : 'No automated SOPs yet.'}</p> :
      <div className="space-y-2">
        {items.map(p => <Link key={p.id} href={`/playbooks/${p.id}`} className="group flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><Zap className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{p.name}</span>
            <span className="text-xs text-muted-foreground">v{p.version} · {p.steps.length} {th ? 'ขั้นตอน' : 'steps'}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
        </Link>)}
      </div>}
  </div>;
}
