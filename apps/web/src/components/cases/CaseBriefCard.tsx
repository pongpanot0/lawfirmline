'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MatterBrief } from '@lawfirm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { caseStageOptions } from '@/lib/stage-labels';
import { taskUpdatePath } from '@/lib/task-detail';
import { cn } from '@/lib/utils';

/** ภาพรวมคดีสำหรับตอบลูกความทางโทรศัพท์ — ข้อมูลตรงจากระบบ ไม่ใช้ AI */

const NO_DATA = 'ไม่มีข้อมูล';

const DECISION_LABELS: Record<string, string> = {
  FILE_SUIT: 'ฟ้องได้',
  DO_NOT_FILE: 'ไม่ควรฟ้อง',
  NEGOTIATE_FIRST: 'เจรจาก่อน',
  SEND_NOTICE: 'ส่งหนังสือบอกกล่าวก่อน',
  COMPLAIN_TO_AUTHORITY: 'ร้องเรียนหน่วยงาน',
  CONSULTATION_ONLY: 'ให้คำปรึกษาอย่างเดียว',
  PENDING: 'รอประเมิน',
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtMoney = (n: number) => `${n.toLocaleString('th-TH')} บาท`;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{value ?? NO_DATA}</dd>
    </div>
  );
}

export function CaseBriefCard({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [brief, setBrief] = useState<MatterBrief | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getCaseBrief(token, caseId).then(setBrief).catch(() => setFailed(true));
  }, [token, caseId]);

  if (failed) return null;
  if (!brief) {
    return <div className="mb-4 h-24 animate-pulse rounded-xl border border-border bg-muted/40" aria-hidden />;
  }

  const stage = brief.stage ? (caseStageOptions('th').find((o) => o.value === brief.stage)?.label ?? brief.stage) : null;
  const caseNumbers = [brief.blackCaseNumber && `ดำ ${brief.blackCaseNumber}`, brief.redCaseNumber && `แดง ${brief.redCaseNumber}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ภาพรวมคดี</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <dl className="space-y-1.5">
          <Row label="ลูกความ" value={brief.clientName} />
          <Row label="ฝ่ายเรา" value={brief.ourParties.join(', ') || null} />
          <Row label="คู่กรณี" value={brief.opponents.map((o) => o.name).join(', ') || null} />
          <Row label="ทนายฝั่งตรงข้าม" value={brief.opposingCounsel.join(', ') || null} />
          <Row label="ศาล / เลขคดี" value={[brief.courtName, caseNumbers].filter(Boolean).join(' · ') || null} />
          <Row label="ทุนทรัพย์" value={brief.claimedAmount != null ? fmtMoney(brief.claimedAmount) : null} />
          <Row
            label="ผลประเมิน"
            value={
              brief.assessment
                ? [brief.assessment.decision && (DECISION_LABELS[brief.assessment.decision] ?? brief.assessment.decision), brief.assessment.caseStrength]
                    .filter(Boolean)
                    .join(' · ') || null
                : null
            }
          />
          <Row
            label="ขั้นตอนตอนนี้"
            value={stage ? `${stage}${brief.stageChangedAt ? ` (ตั้งแต่ ${fmtDate(brief.stageChangedAt)})` : ''}` : null}
          />
          <Row
            label="นัดถัดไป"
            value={brief.nextEvent ? `${fmtDate(brief.nextEvent.at)} · ${brief.nextEvent.title}` : null}
          />
          <Row label="ทนายผู้รับผิดชอบ" value={brief.leadLawyerName} />
        </dl>

        <div className="space-y-3">
          <div>
            <p className="mb-1 text-sm font-semibold">ล่าสุด</p>
            {brief.recentEvents.length ? (
              <ul className="space-y-1 text-sm">
                {brief.recentEvents.map((e, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">{fmtDate(e.at)}</span> · {e.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{NO_DATA}</p>
            )}
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold">งานค้าง · ต้องตามใคร</p>
            {brief.openTasks.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {brief.openTasks.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={taskUpdatePath({ id: t.id, caseId: brief.id })}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="shrink-0 text-muted-foreground">{t.assigneeName ?? 'ยังไม่มีผู้รับผิดชอบ'}</span>
                      {t.daysOverdue > 0 ? (
                        <span className="shrink-0 font-semibold text-destructive">เลย {t.daysOverdue} วัน</span>
                      ) : (
                        <span className={cn('shrink-0', t.daysStuck >= 3 ? 'font-semibold text-warning' : 'text-muted-foreground')}>
                          ค้าง {t.daysStuck} วัน
                        </span>
                      )}
                    </Link>
                    {t.holdReason && <p className="px-3 pb-2 text-xs text-muted-foreground">พักไว้: {t.holdReason}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">ไม่มีงานค้าง</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
