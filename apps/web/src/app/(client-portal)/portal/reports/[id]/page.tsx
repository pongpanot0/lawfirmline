'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi } from '@/lib/portal-api';
import { AnnualReportListItem, AnnualReportSnapshot } from '@/lib/annual-report';
import { AnnualReportView } from '@/components/reports/AnnualReportView';
import { PortalShell } from '@/components/layout/PortalShell';
import { Button } from '@/components/ui/button';

export default function PortalReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [report, setReport] = useState<AnnualReportListItem & { snapshot: AnnualReportSnapshot }>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token || !id) return;
    portalApi.getAnnualReport(token, id)
      .then(setReport)
      .catch((e) => setError(e instanceof Error ? e.message : 'เปิดรายงานไม่สำเร็จ'))
      .finally(() => setBusy(false));
  }, [token, id]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/portal/reports" className="text-sm text-primary hover:underline">← รายงานประจำปี</Link>
        {report && <Button type="button" variant="outline" onClick={() => window.print()}>พิมพ์ / บันทึกเป็น PDF</Button>}
      </div>
      {busy ? (
        <p className="text-sm text-muted-foreground">กำลังโหลดรายงาน...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : report ? (
        <>
          <p className="mb-4 text-xs text-muted-foreground print:hidden">
            หากต้องการเก็บไฟล์ ให้กด “พิมพ์ / บันทึกเป็น PDF” แล้วเลือกปลายทางเป็น PDF
          </p>
          <div className="rounded-xl border bg-white p-4 shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none">
            <AnnualReportView report={report.snapshot} portal />
            <p className="mt-6 border-t pt-3 text-xs text-slate-500">
              เผยแพร่เมื่อ {new Date(report.publishedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
            </p>
          </div>
        </>
      ) : null}
    </PortalShell>
  );
}
