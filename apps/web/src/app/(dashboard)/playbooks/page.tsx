'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { hasFirmCapability } from '@lawfirm/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, Plus, Zap } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

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
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const id = params.get('id');
    if (id) { router.replace(`/playbooks/${encodeURIComponent(id)}`); return; }
    if (params.get('new') === '1') { router.replace('/playbooks/new'); return; }
    if (!token) return;
    setLoading(true); setError('');
    setupRequest<PlaybookRelease[]>(token, '/playbooks')
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, [token, params, router, reload]);

  const canCreate = hasFirmCapability(user?.firmRole, 'manageFirmContent');
  const createLink = <Link href="/playbooks/new" className={buttonVariants()}><Plus className="h-4 w-4" aria-hidden />{th ? 'สร้าง SOP' : 'Create SOP'}</Link>;
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <Link href="/sops" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />{th ? 'คู่มือการทำงาน' : 'SOP library'}</Link>
      <PageHeader
        title={th ? 'SOP อัตโนมัติ' : 'Automated SOPs'}
        description={th ? 'ขั้นตอนงานที่ระบบสร้างให้ตามประเภทคดี' : 'Workflows the system creates for each case type.'}
        actions={canCreate ? createLink : undefined}
      />
    </div>
    {error ? <LoadFailed message={error} onRetry={() => setReload(n => n + 1)} /> : loading ? <div role="status" aria-label={th ? 'กำลังโหลด SOP' : 'Loading SOPs'} className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div> : items.length === 0 ?
      (<EmptyState title={th ? 'ยังไม่มี SOP อัตโนมัติ' : 'No automated SOPs yet.'} action={canCreate ? createLink : undefined} />) :
      <div className="space-y-2">
        {items.map(p => <Link key={p.id} href={`/playbooks/${p.id}`} className="group flex min-h-20 items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <Zap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{p.name}</span>
            <span className="text-xs tabular-nums text-muted-foreground">v{p.version} · {p.steps.length} {th ? 'ขั้นตอน' : 'steps'}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
        </Link>)}
      </div>}
  </div>;
}
