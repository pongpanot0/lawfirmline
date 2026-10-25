'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi } from '@/lib/portal-api';
import { AnnualReportListItem, reportAudienceLabel } from '@/lib/annual-report';
import { PortalShell } from '@/components/layout/PortalShell';
import { Card } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';

export default function PortalReportsPage() {
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [reports, setReports] = useState<AnnualReportListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    setBusy(true);
    setError('');
    portalApi.getAnnualReports(token)
      .then(setReports)
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ'))
      .finally(() => setBusy(false));
  }, [token, attempt]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <PageHeader title="รายงานประจำปี" description="สรุปคดีและยอดของแต่ละปีที่สำนักงานเผยแพร่ให้คุณ" />
      {busy ? (
        <div className="space-y-3" role="status" aria-label="กำลังโหลดรายงาน">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>
      ) : error ? (
        <LoadFailed message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : reports.length === 0 ? (
        <EmptyState title="ยังไม่มีรายงานประจำปี" description="เมื่อสำนักงานเผยแพร่รายงาน รายงานจะแสดงที่นี่" />
      ) : (
        <div className="space-y-3">
          {reports.map((item) => (
            <Link key={item.id} href={`/portal/reports/${item.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Card className="p-4 transition-colors hover:border-primary/40 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{reportAudienceLabel(item.audience)}</p>
                    <h2 className="mt-1 text-lg font-semibold">รายงานปี {item.year + 543}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      เผยแพร่ {new Date(item.publishedAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">เปิดรายงาน<ChevronRight className="h-4 w-4" aria-hidden /></span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-sm">
                  <span><strong className="tabular-nums">{item.totals?.cases ?? '—'}</strong> คดีในรายงาน</span>
                  <span><strong className="tabular-nums">{item.totals?.closedAtYearEnd ?? '—'}</strong> ปิดแล้วเมื่อสิ้นปี</span>
                  <span><strong className="tabular-nums">{item.totals?.ongoing ?? '—'}</strong> ยังดำเนินอยู่เมื่อสิ้นปี</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
