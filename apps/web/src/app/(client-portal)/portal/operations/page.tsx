'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Briefcase } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary } from '@/lib/portal-api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PortalShell } from '@/components/layout/PortalShell';
import { StageTrack } from '@/components/portal/StageTrack';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatDate } from '@/lib/utils';

/**
 * Active matters the contact can access — separate from portal intake
 * ("เรื่องที่ส่ง"), which is pre-engagement submissions only.
 */
export default function PortalOperationsPage() {
  const d = useDashboardT();
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    portalApi
      .getCases(token)
      .then(setCases)
      .catch(console.error)
      .finally(() => setLoadingData(false));
  }, [token]);

  if (loading || !contact) return null;

  return (
    <PortalShell>
      <div className="mb-6">
        <p className="mb-1 text-[12px] font-semibold tracking-wide text-primary">งานดำเนินการ</p>
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">คดีของฉัน</h1>
        <p className="text-[13.5px] text-muted-foreground">
          คดีที่สำนักงานรับดูแลคุณแล้ว — สถานะ นัดศาล เอกสารที่เผยแพร่ และข้อความกับทนาย
        </p>
      </div>

      {loadingData ? (
        <p className="text-sm text-muted-foreground">กำลังโหลดคดีของคุณ...</p>
      ) : cases.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted-foreground">
            <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-accent">
              <Briefcase className="h-5 w-5" />
            </div>
            <p className="text-[13.5px] font-semibold text-foreground">ยังไม่มีคดีในพอร์ทัล</p>
            <p className="max-w-sm text-[12.5px]">
              เมื่อสำนักงานเปิดสิทธิ์เข้าถึงคดีให้คุณ รายการจะแสดงที่นี่ — แยกจากเรื่องที่ส่งเข้ามาใหม่
            </p>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => {
            const status = getCaseStatusDisplay(c.status, d.caseStatus);
            return (
              <Card
                key={c.id}
                className="cursor-pointer p-[18px] transition-colors hover:border-primary/40"
                onClick={() => router.push(`/portal/cases/${c.id}`)}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14.5px] font-bold leading-snug">{c.title}</p>
                    <p className="text-[12.5px] text-muted-foreground">
                      เลขที่อ้างอิง {c.ownRef}
                      {c.courtName ? ` · ${c.courtName}` : ''}
                    </p>
                  </div>
                  <Badge variant={status.variant} className="shrink-0">
                    {status.label}
                  </Badge>
                </div>
                <StageTrack status={c.status} className="mb-3" />
                <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
                  {c.nextHearing ? (
                    <span className="font-semibold text-warning">
                      นัดถัดไป {formatDate(c.nextHearing.startAt)}
                    </span>
                  ) : (
                    <span>ยังไม่มีนัดศาล</span>
                  )}
                  <span>เปิดเมื่อ {formatDate(c.openedAt)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PortalShell>
  );
}
