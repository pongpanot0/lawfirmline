'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, ChevronRight, FileText, MessageSquare, Plus } from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary, PortalDashboardSummary } from '@/lib/portal-api';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { PortalShell } from '@/components/layout/PortalShell';
import { PortalCaseCard } from '@/components/portal/PortalCaseCard';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function PortalDashboardPage() {
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [summary, setSummary] = useState<PortalDashboardSummary | null>(null);
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
    Promise.all([portalApi.getCases(token), portalApi.getDashboardSummary(token)])
      .then(([c, s]) => {
        setCases(c);
        setSummary(s);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoadingData(false));
  }, [token, attempt]);

  if (loading || !contact) return null;

  const retry = () => setAttempt((n) => n + 1);

  return (
    <PortalShell>
      <PageHeader
        title="ภาพรวม"
        description={contact.client?.name ? `คดีและเอกสารล่าสุดของ ${contact.client.name}` : undefined}
        actions={
          <Link href="/portal/intake/new" className={buttonVariants()}>
            <Plus className="h-4 w-4" aria-hidden />
            ส่งเรื่องใหม่
          </Link>
        }
      />

      {failed ? (
        <LoadFailed onRetry={retry} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
            {loadingData || !summary ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-card p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-7 w-12" />
                  <Skeleton className="mt-2 h-3 w-28" />
                </div>
              ))
            ) : (
              <>
                <Kpi label="คดีที่กำลังดำเนินการ" value={summary.activeCases} meta={`จากทั้งหมด ${summary.totalCases} คดี`} />
                <Kpi
                  label="นัดศาลถัดไป"
                  value={summary.nextHearing ? formatDate(summary.nextHearing.startAt, { day: 'numeric', month: 'short' }) : '—'}
                  meta={summary.nextHearing ? summary.nextHearing.courtName ?? summary.nextHearing.title : 'ยังไม่มีนัดศาล'}
                />
                <Kpi label="เอกสารใหม่ (14 วัน)" value={summary.pendingDocuments} meta="เอกสารที่สำนักงานแชร์ให้คุณ" />
                <Kpi label="ข้อความใหม่" value={summary.unreadMessages} meta="จากทนายความผู้รับผิดชอบ" />
              </>
            )}
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-[1fr_336px]">
            <section aria-labelledby="portal-cases-heading">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 id="portal-cases-heading" className="text-base font-semibold">งานดำเนินการ</h2>
                  <p className="text-sm text-muted-foreground">คดีที่สำนักงานรับดูแลแล้ว</p>
                </div>
                <Link href="/portal/operations" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline">
                  ดูทั้งหมด
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              {loadingData ? (
                <div className="flex flex-col gap-3" role="status" aria-label="กำลังโหลดคดี">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
                </div>
              ) : cases.length === 0 ? (
                <InlineEmptyState
                  title="ยังไม่มีคดีที่สำนักงานรับดูแล"
                  action={<Link href="/portal/intake/new" className={buttonVariants({ variant: 'outline' })}>ส่งเรื่องใหม่</Link>}
                />
              ) : (
                <div className="flex flex-col gap-3">
                  {cases.slice(0, 3).map((c) => <PortalCaseCard key={c.id} item={c} />)}
                </div>
              )}
            </section>

            <div className="flex flex-col gap-5">
              <Card className="p-4 sm:p-5">
                <h2 className="mb-2 text-base font-semibold">กิจกรรมล่าสุด</h2>
                {loadingData || !summary ? (
                  <Skeleton className="h-20 w-full" />
                ) : summary.recentActivity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีความเคลื่อนไหว</p>
                ) : (
                  summary.recentActivity.map((item, i) => {
                    const Icon = item.type === 'document' ? FileText : item.type === 'message' ? MessageSquare : CalendarClock;
                    return (
                      <div key={i} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm leading-snug">
                            <span className="font-medium">{item.label}</span> · {item.caseTitle}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </Card>

              <Card className="p-4 sm:p-5">
                <h2 className="mb-2 text-base font-semibold">เอกสารล่าสุด</h2>
                {loadingData || !summary ? (
                  <Skeleton className="h-20 w-full" />
                ) : summary.recentDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ยังไม่มีเอกสารที่สำนักงานแชร์ให้คุณ</p>
                ) : (
                  summary.recentDocuments.map((doc) => (
                    <Link
                      key={doc.documentId}
                      href={`/portal/cases/${doc.caseId}`}
                      className="flex min-h-11 items-center gap-3 border-b border-border py-2.5 last:border-0 hover:text-primary"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.filename}</p>
                        <p className="truncate text-xs text-muted-foreground">{doc.caseTitle}</p>
                      </div>
                    </Link>
                  ))
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </PortalShell>
  );
}

function Kpi({ label, value, meta }: { label: string; value: React.ReactNode; meta: string }) {
  return (
    <div className="min-w-0 bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}
