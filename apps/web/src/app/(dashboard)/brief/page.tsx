'use client';

import { useEffect, useState } from 'react';
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
  const [reload, setReload] = useState(0);

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
        else if (err instanceof ApiError && err.status === 403) setError('หน้านี้สำหรับเจ้าของสำนักงานและผู้จัดการสำนักงานเท่านั้น');
        else setError(err instanceof Error ? err.message : 'โหลดสรุปไม่สำเร็จ');
      });
  }, [token, date, reload]);

  const header = (
    <PageHeader
      title="สรุปประจำวัน"
      description="งานที่ติดอยู่ ติดที่ใคร กี่วันแล้ว — สรุปให้ทุกเช้า 07:30"
      actions={
        dates.length > 0 && (
          <select
            aria-label="เลือกวัน"
            value={date ?? dates[0]}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
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

  if (error) return <div>{header}<LoadFailed message={error} onRetry={() => setReload((n) => n + 1)} /></div>;
  if (brief === undefined) return <PageLoading title="กำลังโหลดสรุปประจำวัน" lines={4} />;
  if (brief === null) return <div>{header}<InlineEmptyState title="ยังไม่มีสรุปสำหรับวันนี้" /></div>;

  const { data } = brief;
  return (
    <div className="space-y-4">
      {header}

      <Card>
        <CardContent className="space-y-3 pt-6">
          {brief.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed">{brief.summary}</p>}
          <div className="flex flex-wrap gap-4 text-sm">
            <span><strong className="text-lg">{data.totals.stuckTasks}</strong> งานติด</span>
            <span><strong className="text-lg text-destructive">{data.totals.overdueTasks}</strong> งานเลยกำหนด</span>
            <span><strong className="text-lg">{data.totals.people}</strong> คนที่ต้องตาม</span>
            <span className="text-muted-foreground">เกณฑ์: ไม่ขยับ {data.stuckTaskDays} วันขึ้นไป</span>
          </div>
        </CardContent>
      </Card>

      {data.groups.length === 0 ? (
        <InlineEmptyState title="วันนี้ไม่มีงานติด" />
      ) : (
        data.groups.map((g) => (
          <Card key={g.assigneeId ?? 'unassigned'}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {g.assigneeName} <span className="font-normal text-muted-foreground">· {g.items.length} งาน</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {g.items.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={taskUpdatePath({ id: t.id, caseId: t.caseId })}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t.matterTitle}
                          {t.holdReason ? ` · พักไว้: ${t.holdReason}` : ''}
                        </span>
                      </span>
                      {t.hearingWithin7Days && (
                        <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">มีนัดใน 7 วัน</span>
                      )}
                      <span className={cn('shrink-0 font-semibold', t.daysOverdue > 0 ? 'text-destructive' : 'text-warning')}>
                        {t.daysOverdue > 0 ? `เลย ${t.daysOverdue} วัน` : `ค้าง ${t.daysStuck} วัน`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

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
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
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
