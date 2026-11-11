'use client';

import { ON_HOLD_CATEGORY_LABEL } from '@/lib/on-hold';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { fmt, dateLocale } from '@/lib/i18n/dashboard';
import { useAuth } from '@/lib/auth';
import { CaseStatus, hasFirmCapability } from '@lawfirm/shared';
import { api, PairingEntry, OnHoldTaskEntry, CaseHealth, TeamPerformanceRow, WorkflowMetrics } from '@/lib/api';
import { OnHoldResumeButton } from './onhold-actions';
import { setupChecks, setupRequest, SetupProgress } from '@/lib/practice-setup';
import { DailyWorkboard } from '@/components/operations/DailyWorkboard';
import { TeamRadar } from '@/components/operations/TeamRadar';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState, InlineEmptyState, PageLoading, Skeleton, TableEmptyRow } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { ChevronRight, Users, ClipboardList, Activity, BarChart3 } from 'lucide-react';

type LoadState = 'loading' | 'failed' | 'ready';

type KpiItem = { label: string; value: ReactNode; hint?: string; hintTone?: 'down' | 'neutral'; href?: string };

/** One container, hairline dividers between cells, label over value. */
function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
      {items.map((item) => {
        const body = (
          <>
            <p className="text-xs text-muted-foreground sm:text-sm">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
            {item.hint && (
              <p className={`mt-1 text-xs ${item.hintTone === 'down' ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>{item.hint}</p>
            )}
          </>
        );
        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className="min-w-0 bg-card px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {body}
          </Link>
        ) : (
          <div key={item.label} className="min-w-0 bg-card px-4 py-3">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export default function OperationsPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const { locale } = useLocale();
  const canRunOps = hasFirmCapability(user?.firmRole, 'runOperations');
  const canSetUp = hasFirmCapability(user?.firmRole, 'manageFirmContent');
  const [tab, setTab] = useState('radar');
  const teamTab = tab === 'radar' || tab === 'daily';
  const [pairing, setPairing] = useState<PairingEntry[]>([]);
  const [pairingLoading, setPairingLoading] = useState(true);
  const [onHold, setOnHold] = useState<OnHoldTaskEntry[]>([]);
  const [onHoldLoading, setOnHoldLoading] = useState(true);
  const [caseHealth, setCaseHealth] = useState<CaseHealth | null>(null);
  const [performance, setPerformance] = useState<TeamPerformanceRow[]>([]);
  const [workflowMetrics, setWorkflowMetrics] = useState<WorkflowMetrics | null>(null);
  const [healthState, setHealthState] = useState<LoadState>('loading');
  const [performanceState, setPerformanceState] = useState<LoadState>('loading');
  const [opsRetry, setOpsRetry] = useState(0);
  const retryOps = () => setOpsRetry((n) => n + 1);
  const [setupLeft, setSetupLeft] = useState(0);

  useEffect(() => {
    if (!token || !canSetUp) return;
    setupRequest<SetupProgress>(token, '/progress', undefined, true)
      .then((p) => setSetupLeft(Object.values(setupChecks(p)).filter((done) => !done).length))
      .catch(() => setSetupLeft(0));
  }, [token, canSetUp]);

  useEffect(() => {
    if (!token || !canRunOps) return;
    setHealthState('loading');
    setPerformanceState('loading');
    api
      .getCaseHealth(token)
      .then((h) => { setCaseHealth(h); setHealthState('ready'); })
      .catch((e) => { console.error(e); setHealthState('failed'); });
    api
      .getTeamPerformance(token)
      .then((rows) => { setPerformance(rows); setPerformanceState('ready'); })
      .catch((e) => { console.error(e); setPerformanceState('failed'); });
    api.getWorkflowMetrics(token).then(setWorkflowMetrics).catch(console.error);
  }, [token, canRunOps, tab, opsRetry]);

  useEffect(() => {
    if (!token || !canRunOps || teamTab) return;
    setPairingLoading(true);
    api.getPairing(token).then(setPairing).catch(console.error).finally(() => setPairingLoading(false));
  }, [token, canRunOps, tab]);

  const loadOnHold = () => {
    if (!token || !canRunOps) return;
    setOnHoldLoading(true);
    api
      .getOnHoldTasks(token)
      .then(setOnHold)
      .catch(console.error)
      .finally(() => setOnHoldLoading(false));
  };

  useEffect(loadOnHold, [token, canRunOps, tab]);

  // Everyone can view the team; management actions remain capability-gated.
  if (!canRunOps) return <TeamRadar />;

  return (
    <TeamRadar canManage onShowDaily={() => setTab('daily')}>{(counts, teamTable) => <>
      {setupLeft > 0 && <div className="flex flex-wrap gap-3 text-sm"><Link href="/getting-started" className="min-h-11 content-center underline" title="ดำเนินการตั้งค่าสำนักงาน">ตั้งค่าสำนักงานเหลือ {setupLeft} ขั้น <ChevronRight className="inline h-4 w-4" aria-hidden /></Link></div>}
      <Tabs value={tab} onValueChange={setTab}>

        <TabsList className="grid grid-cols-4 gap-0 rounded-xl border bg-card shadow-sm">
          <TabsTrigger value="radar" className="min-w-0 flex-col gap-1 px-0 text-[10px] min-[360px]:text-[11px] sm:flex-row sm:gap-2 sm:px-1 sm:text-sm"><Users className="h-4 w-4" aria-hidden /><span>ทีม {counts.team !== null && counts.team}</span></TabsTrigger>
          <TabsTrigger value="daily" className="min-w-0 flex-col gap-1 px-0 text-[10px] min-[360px]:text-[11px] sm:flex-row sm:gap-2 sm:px-1 sm:text-sm"><ClipboardList className="h-4 w-4" aria-hidden /><span>ต้องตามวันนี้ {counts.today !== null && counts.today}</span></TabsTrigger>
          <TabsTrigger value="health" className="min-w-0 flex-col gap-1 px-0 text-[10px] min-[360px]:text-[11px] sm:flex-row sm:gap-2 sm:px-1 sm:text-sm"><Activity className="h-4 w-4" aria-hidden /><span>สุขภาพงาน {caseHealth && caseHealth.inactiveCases.length + caseHealth.stuckCases.length + onHold.length}</span></TabsTrigger>
          <TabsTrigger value="performance" className="min-w-0 flex-col gap-1 px-0 text-[10px] min-[360px]:text-[11px] sm:flex-row sm:gap-2 sm:px-1 sm:text-sm"><BarChart3 className="h-4 w-4" aria-hidden />ผลงาน</TabsTrigger>
        </TabsList>
        <TabsContent value="radar">{teamTable}</TabsContent>
        <TabsContent value="daily"><DailyWorkboard /></TabsContent>
        <TabsContent value="health"><Link href="/operations/paper-files" className="mb-3 inline-flex min-h-11 items-center text-sm underline" title="ดูสำนวนที่ถูกเบิกอยู่">ดูสำนวนที่ถูกเบิกอยู่ →</Link><h2 className="mb-3 text-lg font-semibold">พักงาน</h2>
          <p className="mb-3 text-sm text-muted-foreground">{d.operations.tabOnHoldHint}</p>
          <Card>
            <CardContent className="p-0">
              {onHoldLoading ? (
                <div className="p-4">
                  <PageLoading title={d.operations.loadingOnHold} lines={3} />
                </div>
              ) : onHold.length === 0 ? (
                <EmptyState title={d.operations.emptyOnHoldTitle} description={d.operations.emptyOnHoldDesc} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{d.operations.colTask}</TableHead>
                      <TableHead>{d.operations.colCase}</TableHead>
                      <TableHead>{d.operations.colAssignee}</TableHead>
                      <TableHead>{d.operations.colReason}</TableHead>
                      <TableHead>{d.operations.colFollower}</TableHead>
                      <TableHead>{d.operations.colNextFollowUp}</TableHead>
                      <TableHead>{d.operations.colDueDate}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {onHold.map((item) => (
                      <TableRow key={item.taskId} className={item.isOverdue ? 'bg-red-50/50 dark:bg-red-950/20' : undefined}>
                        <TableCell>{item.taskTitle}</TableCell>
                        <TableCell>
                          {item.caseOwnRef ?? '-'} {item.caseTitle ?? ''}
                        </TableCell>
                        <TableCell>{item.assigneeName ?? '-'}</TableCell>
                        <TableCell>
                          {item.category && item.category !== 'OTHER' && (
                            <Badge variant="muted" className="mr-1">
                              {ON_HOLD_CATEGORY_LABEL[item.category] ?? item.category}
                            </Badge>
                          )}
                          {item.reason}
                        </TableCell>
                        <TableCell>{item.followerName ?? '-'}</TableCell>
                        <TableCell>
                          {item.nextFollowUpAt
                            ? new Date(item.nextFollowUpAt).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' })
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {item.dueDate ? (
                            <Badge variant={item.isOverdue ? 'destructive' : 'muted'}>
                              {new Date(item.dueDate).toLocaleDateString(dateLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' })}
                              {item.isOverdue ? d.operations.overdueSuffix : ''}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <OnHoldResumeButton
                            token={token!}
                            caseId={item.caseId}
                            taskId={item.taskId}
                            onResumed={loadOnHold}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <h2 className="mb-3 text-lg font-semibold">ผลงานทีม</h2>
          {workflowMetrics && (
            <div className="mb-4">
              <KpiStrip
                items={[
                  {
                    label: locale === 'th' ? 'รับเรื่อง → เปิดคดี (วัน)' : 'Intake → case opened (days)',
                    value: workflowMetrics.intakeToCase.averageDays ?? '—',
                    hint: `n=${workflowMetrics.intakeToCase.sampleCount}`,
                  },
                  {
                    label: locale === 'th' ? 'ขอเอกสาร → ได้รับ (วัน)' : 'Document request → received (days)',
                    value: workflowMetrics.documentTurnaround.averageDays ?? '—',
                    hint: `n=${workflowMetrics.documentTurnaround.sampleCount}`,
                  },
                  {
                    label: locale === 'th' ? 'นัดศาล → บันทึกผล (วัน)' : 'Hearing → outcome recorded (days)',
                    value: workflowMetrics.hearingCloseout.averageDays ?? '—',
                    hint: `n=${workflowMetrics.hearingCloseout.sampleCount}`,
                  },
                  {
                    label: locale === 'th' ? 'เอกสารที่ยังรอรับ' : 'Requested documents outstanding',
                    value: workflowMetrics.openDocumentRequests,
                    hintTone: workflowMetrics.overdueDocumentRequests ? 'down' : 'neutral',
                    hint: locale === 'th' ? `เลยกำหนด ${workflowMetrics.overdueDocumentRequests} รายการ` : `${workflowMetrics.overdueDocumentRequests} overdue`,
                    href: '/cases?stage=PRE_LITIGATION',
                  },
                ]}
              />
            </div>
          )}
          <p className="mb-3 text-sm text-muted-foreground">
            {locale === 'th'
              ? 'ตัวชี้วัดกระบวนการ 30 วันล่าสุด — ใช้ดูว่างานไหลหรือไม่ ไม่ใช่จัดอันดับคน; เวลาเฉลี่ยใช้เฉพาะงานที่มีเวลาปิดจริง งานเก่าไม่รวม'
              : 'Operational metrics for the last 30 days, to understand flow rather than rank people. Turnaround uses actual completion timestamps; legacy tasks without one are excluded.'}
          </p>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>สมาชิก</TableHead>
                    <TableHead className="text-right">งานเสร็จ (30 วัน)</TableHead>
                    <TableHead className="text-right">{locale === 'th' ? 'เวลาเฉลี่ย (วัน · ตัวอย่าง)' : 'Average days · samples'}</TableHead>
                    <TableHead className="text-right">งานค้าง</TableHead>
                    <TableHead className="text-right">เลยกำหนด</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {performanceState === 'loading' &&
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`perf-skeleton-${i}`}>
                        <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                      </TableRow>
                    ))}
                  {performanceState === 'failed' && (
                    <TableRow>
                      <TableCell colSpan={5} className="p-4">
                        <LoadFailed message="โหลดผลงานทีมไม่สำเร็จ" onRetry={retryOps} />
                      </TableCell>
                    </TableRow>
                  )}
                  {performanceState === 'ready' && performance.length === 0 && (
                    <TableEmptyRow colSpan={5} title="ยังไม่มีงานของทีมใน 30 วันล่าสุด" description="ตัวเลขจะขึ้นเมื่อมีงานที่มอบหมายให้สมาชิก" />
                  )}
                  {performanceState === 'ready' && performance.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="font-medium">
                        {row.firstName} {row.lastName}
                      </TableCell>
                      <TableCell className="text-right">{row.completedCount}</TableCell>
                      <TableCell className="text-right">{row.avgTurnaroundDays ?? '—'} · {row.turnaroundSampleCount}</TableCell>
                      <TableCell className="text-right">{row.openCount}</TableCell>
                      <TableCell className="text-right">
                        {row.overdueCount > 0 ? (
                          <Badge variant={row.overdueRate >= 30 ? 'destructive' : 'warning'}>
                            {row.overdueCount} ({row.overdueRate}%)
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance"><h2 className="mb-3 text-lg font-semibold">การจับคู่ทีม</h2>
          <p className="mb-3 text-sm text-muted-foreground">{d.operations.tabPairingHint}</p>
          <Card>
            <CardContent className="p-0">
              {pairingLoading ? (
                <div className="p-4">
                  <PageLoading title={d.operations.loadingPairing} lines={3} />
                </div>
              ) : pairing.length === 0 ? (
                <EmptyState title={d.operations.emptyPairingTitle} description={d.operations.emptyPairingDesc} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{d.operations.colPair}</TableHead>
                      <TableHead className="text-right">{d.operations.colSharedCases}</TableHead>
                    </TableRow>
                  </TableHeader>
                    <TableBody>
                      {pairing.length === 0 ? (
                        <TableEmptyRow colSpan={2} title={d.operations.emptyPairingTitle} description={d.operations.emptyPairingDesc} />
                      ) : pairing.map((team) => (
                        <TableRow key={team.key}>
                          <TableCell className="font-medium">
                            {team.members.map((m) => m.name).join(' + ')}
                            {team.members.length > 2 && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                {team.members.length} คน
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{team.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health">
          <h2 className="mb-3 text-lg font-semibold">สุขภาพคดี</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            คดีที่เงียบเกินเกณฑ์ SLA และคดีที่ค้างสถานะเดิมนานเกินไป — กดชื่อคดีเพื่อเข้าไปดู
          </p>
          {healthState === 'loading' && (
            <div role="status" aria-label="กำลังโหลดสุขภาพคดี" className="grid gap-6 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-lg border bg-card p-4">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="mt-4 h-10 w-full" />
                  <Skeleton className="mt-2 h-10 w-full" />
                </div>
              ))}
            </div>
          )}
          {healthState === 'failed' && <LoadFailed message="โหลดสุขภาพคดีไม่สำเร็จ" onRetry={retryOps} />}
          {healthState === 'ready' && caseHealth && (
            <div className="mb-4 flex flex-wrap gap-2">
              {caseHealth.byStatus.map((row) => (
                <Link key={row.status} href={`/cases?status=${row.status}`}>
                  <Badge variant="muted" className="cursor-pointer hover:bg-muted/80">
                    <CaseStatusBadge status={row.status as CaseStatus} /> {row.count}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
          {healthState === 'ready' && <div className="grid gap-6 lg:grid-cols-2">
            {(
              [
                { title: `เงียบเกิน ${caseHealth?.sla.caseUpdateDays ?? 14} วัน (${caseHealth?.inactiveCases.length ?? 0})`, rows: caseHealth?.inactiveCases ?? [] },
                { title: `ค้างสถานะเกิน ${caseHealth?.sla.stuckStatusDays ?? 30} วัน (${caseHealth?.stuckCases.length ?? 0})`, rows: caseHealth?.stuckCases ?? [] },
              ] as const
            ).map((section) => (
              <Card key={section.title}>
                <CardContent className="p-0">
                  <p className="border-b px-4 py-3 text-sm font-semibold">{section.title}</p>
                  {section.rows.length === 0 ? (
                    <InlineEmptyState title="ไม่มีคดีติดสัญญาณนี้" />
                  ) : (
                    <Table>
                      <TableBody>
                        {section.rows.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Link href={`/cases/${c.id}`} className="font-medium hover:underline">
                                {c.title}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {c.leadLawyer.firstName} {c.leadLawyer.lastName} · เปิดคดี{' '}
                                {new Date(c.openedAt).toLocaleDateString(dateLocale(locale))}
                              </p>
                            </TableCell>
                            <TableCell className="text-right">
                              <CaseStatusBadge status={c.status as CaseStatus} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>}
        </TabsContent>
      </Tabs></>}</TeamRadar>
  );
}
