'use client';

import { useEffect, useState } from 'react';
import { Gavel, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { DailyBriefData } from '@lawfirm/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { taskUpdatePath } from '@/lib/task-detail';
import { cn } from '@/lib/utils';
import { NoAccess } from '@/components/ui/NoAccess';

/** สรุปงานติดประจำวันของเจ้าสำนัก (สร้างทุกเช้า 07:30 เฉพาะสำนักงานที่เปิดใช้) */

type Brief = { date: string; summary: string | null; data: DailyBriefData; createdAt: string };

const fmtDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00+07:00`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });

export default function DailyBriefPage() {
  const { token } = useAuth();
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [brief, setBrief] = useState<Brief | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getDailyBriefDates(token).then(setDates).catch(() => setDates([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setBrief(undefined);
    setError(null);
    api
      .getDailyBrief(token, date)
      .then(setBrief)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setBrief(null);
        else if (err instanceof ApiError && err.status === 403) setForbidden(true);
        else setError(err instanceof Error ? err.message : 'โหลดสรุปไม่สำเร็จ');
      });
  }, [token, date, reload]);

  const header = (
    <PageHeader
      title="สรุปประจำวัน"
      description="งานที่ต้องตามของทั้งสำนักงาน สรุปทุกเช้า 07:30"
      actions={
        dates.length > 0 && (
          <select
            aria-label="เลือกวัน"
            title="เลือกวันเพื่อดูสรุปย้อนหลัง"
            value={date ?? dates[0]}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {fmtDay(d)}
              </option>
            ))}
          </select>
        )
      }
    />
  );

  if (forbidden) return <div>{header}<NoAccess /></div>;
  if (error) return <div>{header}<LoadFailed message={error} onRetry={() => setReload((n) => n + 1)} /></div>;
  if (brief === undefined) return <PageLoading title="กำลังโหลดสรุปประจำวัน" lines={4} />;
  if (brief === null) return <div>{header}<InlineEmptyState title="ยังไม่มีสรุปสำหรับวันนี้" description="สรุปจะสร้างทุกเช้า 07:30 สำหรับสำนักงานที่เปิดใช้" /><Link href="/operations" className="mt-4 inline-block text-primary underline">ดูภาระงานทีม</Link></div>;

  const { data } = brief;
  return (
    <div className="space-y-4">
      {header}

      <Card className="border-warning/30 border-l-4 border-l-warning bg-warning/5">
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <p className="text-destructive"><span className="block text-sm text-muted-foreground">สถานะเร่งด่วน</span><strong className="text-xl">เกินกำหนด {data.totals.overdueTasks} งาน</strong></p>
          <p><span className="block text-sm text-muted-foreground">งานที่ต้องตาม</span><strong className="text-xl">ค้าง {data.totals.stuckTasks} งาน</strong></p>
          <p><span className="block text-sm text-muted-foreground">ผู้รับผิดชอบงานค้าง</span><strong className="text-xl">ต้องตาม {data.totals.people} คน</strong></p>
          {brief.summary && <p className="whitespace-pre-wrap text-sm text-muted-foreground sm:col-span-3">{brief.summary}</p>}
        </CardContent>
      </Card>
      {data.groups.length === 0 ? <InlineEmptyState title="วันนี้ไม่มีงานติด" /> : <>
        <div role="tablist" aria-label="เลือกผู้รับผิดชอบ" className="flex flex-wrap rounded-xl border bg-card">
          <button type="button" role="tab" aria-selected={selected === null} title="ดูงานของทุกคน" onClick={() => setSelected(null)} className={cn('min-h-12 flex-1 px-4 text-sm', selected === null && 'border-b-2 border-primary font-semibold')}>ทุกคน · {data.groups.reduce((n, g) => n + g.items.length, 0)}</button>
          {data.groups.map((g) => <button key={g.assigneeId ?? 'unassigned'} type="button" role="tab" aria-selected={selected === (g.assigneeId ?? 'unassigned')} title={`ดูงานของ ${g.assigneeName}`} onClick={() => setSelected(g.assigneeId ?? 'unassigned')} className={cn('min-h-12 flex-1 px-4 text-sm', selected === (g.assigneeId ?? 'unassigned') && 'border-b-2 border-primary font-semibold')}>{g.assigneeName} · {g.items.length}</button>)}
        </div>
        <Card><CardHeader><CardTitle className="text-base">งานที่ต้องตาม</CardTitle></CardHeader><CardContent className="p-0"><ul className="divide-y">
          {data.groups.filter((g) => selected === null || selected === (g.assigneeId ?? 'unassigned')).flatMap((g) => g.items.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.title}</span><span className={cn('inline-flex items-center gap-1 rounded border px-2 py-1 text-xs', t.daysOverdue > 0 ? 'border-destructive/30 text-destructive' : 'border-warning/30 text-warning')}><AlertCircle className="h-3 w-3" />{t.daysOverdue > 0 ? `เกินกำหนด ${t.daysOverdue} วัน` : `ค้าง ${t.daysStuck} วัน`}</span>{t.hearingWithin7Days && <span className="inline-flex items-center gap-1 rounded border border-warning/30 px-2 py-1 text-xs text-warning"><Gavel className="h-3 w-3" />มีนัดใน 7 วัน</span>}</div><p className="mt-1 break-words text-sm text-muted-foreground">{t.matterTitle} · ผู้รับผิดชอบ: {g.assigneeName}{t.holdReason ? ` · พักไว้: ${t.holdReason}` : ''}</p></div>
            <Link href={taskUpdatePath({ id: t.id, caseId: t.caseId })} title="กดเพื่อเปิดงานนี้" className="rounded-lg border border-primary px-4 py-2 text-sm font-medium">ติดตาม</Link>
          </li>))}
        </ul></CardContent></Card>
      </>}

      {data.stuckCases.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">คดีที่ขั้นตอนไม่ขยับ</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {data.stuckCases.map((c) => (
                <li key={c.caseId}>
                  <Link
                    href={`/cases/${c.caseId}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0 flex-1 break-words">{c.title}</span>
                    <span className="shrink-0 text-muted-foreground">{c.daysSinceStageChange} วัน</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
