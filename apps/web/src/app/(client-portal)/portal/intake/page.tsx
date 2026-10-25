'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Paperclip, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { portalApi, type PortalIntakeSubmissionEntry } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalShell } from '@/components/layout/PortalShell';
import { formatDate } from '@/lib/utils';
import { INTAKE_STATUS_VARIANT } from '@/components/portal/intake-status';

export default function MyIntakeSubmissionsPage() {
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();
  const [items, setItems] = useState<PortalIntakeSubmissionEntry[]>([]);
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
      .getMyIntakeSubmissions(token)
      .then(setItems)
      .catch(() => setFailed(true))
      .finally(() => setLoadingData(false));
  }, [token, attempt]);

  if (loading || !contact) return null;

  const newLink = (variant: 'default' | 'outline') => (
    <Link href="/portal/intake/new" className={buttonVariants({ variant })}>
      <Plus className="h-4 w-4" aria-hidden />
      ส่งเรื่องใหม่
    </Link>
  );

  return (
    <PortalShell>
      <PageHeader
        title="เรื่องที่ส่ง"
        description="คำขอและคำปรึกษาที่คุณส่งถึงสำนักงาน พร้อมเอกสารที่สำนักงานส่งกลับ"
        actions={newLink('default')}
      />

      {loadingData ? (
        <div className="flex flex-col gap-3" role="status" aria-label="กำลังโหลดเรื่องที่ส่ง">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : failed ? (
        <LoadFailed onRetry={() => setAttempt((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyState title="ยังไม่มีเรื่องที่ส่ง" description="ส่งเรื่องที่ต้องการปรึกษา แล้วติดตามสถานะได้ที่นี่" action={newLink('outline')} />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/portal/intake/${item.id}`}
              className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium tabular-nums text-muted-foreground">{item.referenceNumber}</p>
                  <p className="font-semibold">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    ส่งเมื่อ {formatDate(item.submittedAt)}
                    {item.withdrawnByClient ? ' · คุณยกเลิกเรื่องนี้แล้ว' : ''}
                  </p>
                </div>
                <Badge variant={INTAKE_STATUS_VARIANT[item.externalStatus] ?? 'muted'} className="shrink-0">
                  {item.externalStatus}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" aria-hidden />
                  เอกสารที่คุณส่ง <span className="tabular-nums">{item.attachments?.length ?? 0}</span> ไฟล์
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                  เอกสารจากสำนักงาน <span className="tabular-nums">{item.firmDocuments?.length ?? 0}</span> ไฟล์
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
