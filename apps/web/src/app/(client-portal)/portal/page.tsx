'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Bell,
  Briefcase,
  CalendarClock,
  FileText,
  MessageSquare,
  Plus,
  Inbox,
  FileCheck2,
} from 'lucide-react';
import { usePortalAuth } from '@/lib/portal-auth';
import { portalApi, PortalCaseSummary, PortalDashboardSummary } from '@/lib/portal-api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { PortalShell } from '@/components/layout/PortalShell';
import { StageTrack } from '@/components/portal/StageTrack';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function PortalDashboardPage() {
  const { contact, token, loading } = usePortalAuth();
  const router = useRouter();
  const [cases, setCases] = useState<PortalCaseSummary[]>([]);
  const [summary, setSummary] = useState<PortalDashboardSummary | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  useEffect(() => {
    if (!token) return;
    Promise.all([portalApi.getCases(token), portalApi.getDashboardSummary(token)])
      .then(([c, s]) => {
        setCases(c);
        setSummary(s);
      })
      .finally(() => setLoadingData(false));
  }, [token]);

  if (loading || !contact) return null;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'สวัสดีตอนเช้า' : greetingHour < 18 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  return (
    <PortalShell>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="mb-1 text-[12.5px] font-semibold text-primary">{greeting}</p>
          <h1 className="mb-1 text-2xl font-extrabold tracking-tight">ยินดีต้อนรับกลับ, {contact.name}</h1>
          <p className="text-[13.5px] text-muted-foreground">
            นี่คือภาพรวมคดีและเอกสารล่าสุดของ {contact.client?.name}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-border bg-card"
            aria-label="การแจ้งเตือน"
          >
            <Bell className="h-4 w-4" />
          </button>
          <Link href="/portal/operations" className={buttonVariants({ variant: 'outline' })}>
            <Briefcase className="h-4 w-4" />
            งานดำเนินการ
          </Link>
          <Link href="/portal/intake" className={buttonVariants({ variant: 'outline' })}>
            <Inbox className="h-4 w-4" />
            เรื่องที่ส่ง
          </Link>
          <Link href="/portal/intake/new" className={buttonVariants({ variant: 'default' })}>
            <Plus className="h-4 w-4" />
            ส่งเรื่องใหม่
          </Link>
        </div>
      </div>

      {!loadingData && summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={<Briefcase className="h-4 w-4" />}
            iconClass="bg-primary/10 text-primary"
            label="คดีที่กำลังดำเนินการ"
            value={summary.activeCases}
            meta={`จากทั้งหมด ${summary.totalCases} คดี`}
          />
          <StatCard
            icon={<CalendarClock className="h-4 w-4" />}
            iconClass="bg-warning/15 text-warning"
            label="นัดศาลถัดไป"
            value={summary.nextHearing ? formatDate(summary.nextHearing.startAt, { day: 'numeric', month: 'short' }) : '—'}
            meta={summary.nextHearing ? summary.nextHearing.courtName ?? summary.nextHearing.title : 'ยังไม่มีนัดศาล'}
            metaClass={summary.nextHearing ? 'text-warning font-semibold' : undefined}
          />
          <StatCard
            icon={<FileText className="h-4 w-4" />}
            iconClass="bg-destructive/10 text-destructive"
            label="เอกสารใหม่ (14 วัน)"
            value={summary.pendingDocuments}
            meta="เอกสารที่เพิ่งเผยแพร่ให้ท่าน"
          />
          <StatCard
            icon={<MessageSquare className="h-4 w-4" />}
            iconClass="bg-success/15 text-success"
            label="ข้อความใหม่"
            value={summary.unreadMessages}
            meta="จากทนายความผู้รับผิดชอบ"
            metaClass={summary.unreadMessages > 0 ? 'text-success font-semibold' : undefined}
          />
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_336px]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-bold">งานดำเนินการ</h2>
              <p className="text-[12px] text-muted-foreground">คดีที่สำนักงานรับดูแลแล้ว</p>
            </div>
            <Link href="/portal/operations" className="text-[12.5px] font-semibold text-primary">
              ดูทั้งหมด
            </Link>
          </div>

          {loadingData ? (
            <p className="text-sm text-muted-foreground">กำลังโหลดคดีของคุณ...</p>
          ) : cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีคดี — เรื่องที่ส่งใหม่ดูได้ที่เมนูเรื่องที่ส่ง</p>
          ) : (
            <div className="flex flex-col gap-3">
              {cases.slice(0, 3).map((c) => {
                const status = getCaseStatusDisplay(c.status);
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
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Card className="p-[18px]">
            <h2 className="mb-2 text-[14px] font-bold">กิจกรรมล่าสุด</h2>
            {!loadingData && summary && summary.recentActivity.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">ยังไม่มีกิจกรรม</p>
            )}
            {summary?.recentActivity.map((item, i) => (
              <div key={i} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-accent">
                  {item.type === 'document' ? (
                    <FileText className="h-3.5 w-3.5" />
                  ) : item.type === 'message' ? (
                    <MessageSquare className="h-3.5 w-3.5" />
                  ) : (
                    <CalendarClock className="h-3.5 w-3.5" />
                  )}
                </div>
                <div>
                  <p className="text-[12.5px] leading-snug">
                    <span className="font-semibold">{item.label}</span> — {item.caseTitle}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{formatDateTime(item.occurredAt)}</p>
                </div>
              </div>
            ))}
          </Card>

          <Card className="p-[18px]">
            <h2 className="mb-2 text-[14px] font-bold">เอกสารล่าสุด</h2>
            {!loadingData && summary && summary.recentDocuments.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">ยังไม่มีเอกสารที่แชร์</p>
            )}
            {summary?.recentDocuments.map((doc) => (
              <Link
                key={doc.documentId}
                href={`/portal/cases/${doc.caseId}`}
                className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                  <FileCheck2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold">{doc.filename}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">{doc.caseTitle}</p>
                </div>
              </Link>
            ))}
          </Card>

          <Card className="border-none bg-gradient-to-br from-primary to-[hsl(224,70%,38%)] p-5 text-primary-foreground">
            <h2 className="mb-1.5 text-[14px] font-bold">มีเรื่องใหม่ที่ต้องการคำปรึกษา?</h2>
            <p className="mb-3.5 text-[12.5px] leading-relaxed text-primary-foreground/85">
              ส่งรายละเอียดเบื้องต้นให้ทีมกฎหมายของเรา เราจะติดต่อกลับภายใน 1 วันทำการ
            </p>
            <Link href="/portal/intake/new" className="block w-full rounded-lg bg-white py-2 text-center text-[13.5px] font-semibold text-primary">
              ส่งเรื่องใหม่
            </Link>
          </Card>
        </div>
      </div>
    </PortalShell>
  );
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
  meta,
  metaClass,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  meta: string;
  metaClass?: string;
}) {
  return (
    <Card className="p-[18px]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
        <div className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg ${iconClass}`}>{icon}</div>
      </div>
      <div className="mb-1.5 text-[26px] font-extrabold leading-none tracking-tight">{value}</div>
      <div className={`text-[12px] text-muted-foreground ${metaClass ?? ''}`}>{meta}</div>
    </Card>
  );
}
