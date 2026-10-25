'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary } from '@/lib/portal-api';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { buttonVariants } from '@/components/ui/button';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { PortalShell } from '@/components/layout/PortalShell';
import { PortalCaseCard } from '@/components/portal/PortalCaseCard';

/**
 * Active matters the contact can access — separate from portal intake
 * ("เรื่องที่ส่ง"), which is pre-engagement submissions only.
 */
export default function PortalOperationsPage() {
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    setLoadingData(true);
    setFailed(false);
    portalApi
      .getCases(token)
      .then(setCases)
      .catch(() => setFailed(true))
      .finally(() => setLoadingData(false));
  }, [token, attempt]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <PageHeader title="คดีของฉัน" description="คดีที่สำนักงานรับดูแลแล้ว พร้อมสถานะและนัดศาล" />

      {loadingData ? (
        <div className="flex flex-col gap-3" role="status" aria-label="กำลังโหลดคดี">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : failed ? (
        <LoadFailed onRetry={() => setAttempt((n) => n + 1)} />
      ) : cases.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคดี"
          description="เมื่อสำนักงานรับดูแลเรื่องของคุณ คดีจะแสดงที่นี่"
          action={<Link href="/portal/intake/new" className={buttonVariants({ variant: 'outline' })}>ส่งเรื่องใหม่</Link>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => <PortalCaseCard key={c.id} item={c} showOpened />)}
        </div>
      )}
    </PortalShell>
  );
}
