'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi } from '@/lib/portal-api';
import { AnnualReportListItem, AnnualReportSnapshot } from '@/lib/annual-report';
import { AnnualReportView } from '@/components/reports/AnnualReportView';
import { PortalShell } from '@/components/layout/PortalShell';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

export default function PortalReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [report, setReport] = useState<AnnualReportListItem & { snapshot: AnnualReportSnapshot }>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    portalApi.getAnnualReport(token, id)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'เปิดรายงานไม่สำเร็จ'))
      .finally(() => setBusy(false));
  }, [token, id, attempt]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/portal/reports" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"><ArrowLeft className="h-4 w-4" aria-hidden />รายงานประจำปี</Link>
        {report && <Button type="button" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />พิมพ์ / บันทึกเป็น PDF</Button>}
      </div>
      {busy ? (
        <div role="status" aria-label="กำลังโหลดรายงาน"><Skeleton className="h-96 w-full rounded-lg" /></div>
      ) : error ? (
        <LoadFailed message={error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : report ? (
        <>
          <div className="rounded-lg border bg-card p-4 sm:p-8 print:border-0 print:bg-white print:p-0 print:shadow-none">
            <AnnualReportView report={report.snapshot} portal />
            <p className="mt-6 border-t pt-3 text-xs text-muted-foreground">
              เผยแพร่เมื่อ {new Date(report.publishedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
            </p>
          </div>
        </>
      ) : null}
    </PortalShell>
  );
}
