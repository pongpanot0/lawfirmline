'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileBarChart2 } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi } from '@/lib/portal-api';
import { AnnualReportListItem, reportAudienceLabel } from '@/lib/annual-report';
import { PortalShell } from '@/components/layout/PortalShell';
import { Card } from '@/components/ui/card';

export default function PortalReportsPage() {
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [reports, setReports] = useState<AnnualReportListItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    portalApi.getAnnualReports(token)
      .then(setReports)
      .catch((e) => setError(e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ'))
      .finally(() => setBusy(false));
  }, [token]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <div className="mb-6">
        <p className="mb-1 text-xs font-semibold text-primary">แฟ้มรายงานลูกค้า</p>
        <h1 className="text-2xl font-bold">รายงานคดีประจำปี</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ดูภาพรวมคดีและยอดของแต่ละปีในรายงานที่สำนักงานเผยแพร่ให้คุณ
        </p>
      </div>
      {busy ? (
        <p className="text-sm text-muted-foreground">กำลังโหลดรายงาน...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : reports.length === 0 ? (
        <Card className="p-8 text-center">
          <FileBarChart2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">ยังไม่มีรายงานประจำปี</p>
          <p className="mt-1 text-sm text-muted-foreground">เมื่อสำนักงานเผยแพร่รายงาน รายการจะปรากฏที่นี่</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((item) => (
            <Link key={item.id} href={`/portal/reports/${item.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Card className="border-l-4 border-l-primary p-5 transition-colors hover:border-primary/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{reportAudienceLabel(item.audience)}</p>
                    <h2 className="mt-1 text-xl font-bold">รายงานปี {item.year + 543}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      เผยแพร่ {new Date(item.publishedAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-primary">เปิดรายงาน →</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-sm">
                  <span><strong>{item.totals?.cases ?? 0}</strong> คดีในรายงาน</span>
                  <span><strong>{item.totals?.closedAtYearEnd ?? 0}</strong> ปิดแล้วสิ้นปี</span>
                  <span><strong>{item.totals?.ongoing ?? 0}</strong> ดำเนินอยู่สิ้นปี</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
