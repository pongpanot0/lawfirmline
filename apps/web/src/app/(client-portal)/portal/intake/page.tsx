'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Inbox, Paperclip, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { portalApi, type PortalIntakeSubmissionEntry } from '@/lib/portal-api';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalShell } from '@/components/layout/PortalShell';
import { formatDate } from '@/lib/utils';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'destructive'> = {
  สำนักงานรับเรื่องแล้ว: 'muted',
  รอตกลงขอบเขต: 'warning',
  รับดำเนินการ: 'success',
  ไม่รับดำเนินการ: 'destructive',
  ให้คำปรึกษาเรียบร้อยแล้ว: 'muted',
  ส่งแล้ว: 'muted',
};

export default function MyIntakeSubmissionsPage() {
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();
  const [items, setItems] = useState<PortalIntakeSubmissionEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    portalApi
      .getMyIntakeSubmissions(token)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoadingData(false));
  }, [token]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[12px] font-semibold tracking-wide text-primary">คำร้อง / คำปรึกษา</p>
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight">เรื่องที่ส่ง</h1>
          <p className="text-[13.5px] text-muted-foreground">
            ติดตามสถานะ คำขอที่คุณส่งเข้ามา และเอกสารที่สำนักงานส่งกลับ
          </p>
        </div>
        <Link href="/portal/intake/new" className={buttonVariants({ variant: 'default' })}>
          <Plus className="h-4 w-4" />
          ส่งเรื่องใหม่
        </Link>
      </div>

      {loadingData ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : items.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted-foreground">
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent">
              <Inbox className="h-5 w-5" />
            </div>
            <p className="text-[13.5px] font-semibold text-foreground">ยังไม่มีเรื่องที่ส่ง</p>
            <p className="max-w-xs text-[12.5px]">เมื่อคุณส่งคำร้องหรือขอคำปรึกษาใหม่ รายการจะแสดงที่นี่</p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className={`cursor-pointer p-5 transition-colors hover:border-primary/40 ${
                item.withdrawnByClient ? 'opacity-60' : ''
              }`}
              onClick={() => router.push(`/portal/intake/${item.id}`)}
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-0.5 text-[12px] font-bold tracking-wide text-primary">
                    {item.referenceNumber}
                  </p>
                  <p className="mb-1 text-[14.5px] font-semibold">{item.title}</p>
                  <p className="text-[12px] text-muted-foreground">
                    ส่งเมื่อ {formatDate(item.submittedAt)}
                    {item.withdrawnByClient ? ' · ยกเลิกโดยลูกความ' : ''}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[item.externalStatus] ?? 'muted'} className="shrink-0">
                  {item.externalStatus}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  เอกสารที่คุณส่ง {item.attachments?.length ?? 0} ไฟล์
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  เอกสารจากสำนักงาน {item.firmDocuments?.length ?? 0} ไฟล์
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
