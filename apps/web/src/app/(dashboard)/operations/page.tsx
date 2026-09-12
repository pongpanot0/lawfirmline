'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { fmt, dateLocale } from '@/lib/i18n/dashboard';
import { useAuth } from '@/lib/auth';
import { CaseStatus, FirmRole } from '@lawfirm/shared';
import { api, WorkloadSummary, WorkloadDetail, PairingEntry, OnHoldTaskEntry } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/samnuan/PageHeader';
import { OnHoldResumeButton } from './onhold-actions';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, InlineEmptyState, PageLoading, TableEmptyRow } from '@/components/ui/misc';
import { Users, Scale, AlarmClock, PauseCircle, Sparkles, SlidersHorizontal, MousePointerClick, ChevronRight } from 'lucide-react';

type WorkloadLevelKey = 'levelLight' | 'levelMedium' | 'levelHeavy';

function workloadLevel(total: number): { key: WorkloadLevelKey; variant: 'success' | 'warning' | 'destructive' } {
  if (total <= 3) return { key: 'levelLight', variant: 'success' };
  if (total <= 7) return { key: 'levelMedium', variant: 'warning' };
  return { key: 'levelHeavy', variant: 'destructive' };
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
];

function avatarColor(seed: string) {
  const code = seed.charCodeAt(0) || 0;
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

function LawyerAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(firstName)}`}
    >
      {initials}
    </span>
  );
}

function WorkloadBar({ total, max }: { total: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((total / max) * 100)) : 0;
  const d = useDashboardT();
  const { key, variant } = workloadLevel(total);
  const label = d.operations[key];
  const barColor =
    variant === 'success' ? 'bg-emerald-500' : variant === 'warning' ? 'bg-amber-500' : 'bg-red-500';
  const labelColor =
    variant === 'success' ? 'text-emerald-600' : variant === 'warning' ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="w-32">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`mt-1 text-xs font-medium ${labelColor}`}>{label}</p>
    </div>
  );
}

export default function OperationsPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const { locale } = useLocale();
  const isOwner = user?.firmRole === FirmRole.OWNER;
  const [tab, setTab] = useState('workload');
  const [summary, setSummary] = useState<WorkloadSummary[]>([]);
  /**
   * Distinct open cases. The per-lawyer figures count assignments, and one
   * case with a lead and two buddies is three of those — summing them is
   * not a case count, so the firm-wide number is taken from the cases
   * themselves.
   */
  const [activeCaseCount, setActiveCaseCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nearDeadlineDays, setNearDeadlineDays] = useState(7);
  // Default to lightest-first so the recommended lawyer (least loaded) is the first row.
  const [sortDesc, setSortDesc] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkloadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pairing, setPairing] = useState<PairingEntry[]>([]);
  const [pairingLoading, setPairingLoading] = useState(true);
  const [onHold, setOnHold] = useState<OnHoldTaskEntry[]>([]);
  const [onHoldLoading, setOnHoldLoading] = useState(true);

  useEffect(() => {
    if (!token || !isOwner) return;
    setLoading(true);
    api
      .getWorkloadSummary(token, nearDeadlineDays)
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, isOwner, nearDeadlineDays]);

  useEffect(() => {
    if (!token || !isOwner) return;
    api
      .getCases(token)
      .then((cases) => setActiveCaseCount(cases.filter((c) => c.status !== CaseStatus.CLOSED).length))
      .catch(() => setActiveCaseCount(null));
  }, [token, isOwner]);

  useEffect(() => {
    if (!token || !isOwner || !selectedUserId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    api
      .getWorkloadDetail(token, selectedUserId, nearDeadlineDays)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [token, isOwner, selectedUserId, nearDeadlineDays]);

  useEffect(() => {
    if (!token || !isOwner) return;
    setPairingLoading(true);
    api.getPairing(token).then(setPairing).catch(console.error).finally(() => setPairingLoading(false));
  }, [token, isOwner]);

  const loadOnHold = () => {
    if (!token || !isOwner) return;
    setOnHoldLoading(true);
    api
      .getOnHoldTasks(token)
      .then(setOnHold)
      .catch(console.error)
      .finally(() => setOnHoldLoading(false));
  };

  useEffect(loadOnHold, [token, isOwner]);

  const enriched = useMemo(
    () => summary.map((s) => ({ ...s, total: s.leadCount + s.buddyCount })),
    [summary],
  );
  const maxTotal = useMemo(() => Math.max(1, ...enriched.map((s) => s.total)), [enriched]);
  const sorted = useMemo(
    () => [...enriched].sort((a, b) => (sortDesc ? b.total - a.total : a.total - b.total)),
    [enriched, sortDesc],
  );

  const totalAssignments = enriched.reduce((sum, s) => sum + s.total, 0);
  const totalNearDeadline = enriched.reduce((sum, s) => sum + s.nearDeadlineCount, 0);
  const overdueOnHoldCount = onHold.filter((o) => o.isOverdue).length;

  const recommended = useMemo(() => {
    if (enriched.length === 0) return null;
    return [...enriched].sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      return a.nearDeadlineCount - b.nearDeadlineCount;
    })[0];
  }, [enriched]);

  if (!isOwner) {
    return <p className="text-destructive">{d.operations.noAccess}</p>;
  }

  return (
    <div>
      <PageHeader title={d.operations.title} description={d.operations.description} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={d.operations.kpiLawyers} value={enriched.length} icon={Users} />
        <KpiCard label={d.operations.kpiActiveCases} value={activeCaseCount ?? '—'} icon={Scale} change={fmt(d.operations.kpiActiveCasesChange, { count: totalAssignments })} trend="neutral" />
        <KpiCard
          label={fmt(d.operations.kpiNearDeadline, { days: nearDeadlineDays })}
          value={totalNearDeadline}
          icon={AlarmClock}
          trend={totalNearDeadline > 0 ? 'down' : 'neutral'}
          change={totalNearDeadline > 0 ? d.operations.kpiNeedsFollowUp : undefined}
        />
        <KpiCard
          label={d.operations.kpiOnHold}
          value={onHold.length}
          icon={PauseCircle}
          trend={overdueOnHoldCount > 0 ? 'down' : 'neutral'}
          change={overdueOnHoldCount > 0 ? fmt(d.operations.kpiOnHoldOverdue, { count: overdueOnHoldCount }) : undefined}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="workload">{d.operations.tabWorkload}</TabsTrigger>
          <TabsTrigger value="pairing">{d.operations.tabPairing}</TabsTrigger>
          <TabsTrigger value="onhold">
            {d.operations.tabOnHold}
            {onHold.length > 0 ? ` (${onHold.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workload">
          {recommended && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">{d.operations.recommendPrefix}{' '}</span>
                <span className="font-semibold text-primary">
                  {recommended.firstName} {recommended.lastName}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  {fmt(d.operations.recommendSuffix, {
                    count: recommended.total,
                    extra:
                      recommended.nearDeadlineCount > 0
                        ? fmt(d.operations.recommendNearDeadline, { count: recommended.nearDeadlineCount })
                        : '',
                  })}
                </span>
              </p>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {d.operations.thresholdLabel}
              <Input
                type="number"
                min={1}
                value={nearDeadlineDays}
                onChange={(e) => setNearDeadlineDays(Math.max(1, Number(e.target.value) || 7))}
                className="h-8 w-16"
              />
              {d.operations.days}
            </label>
            <Button size="sm" variant="outline" onClick={() => setSortDesc((s) => !s)}>
              {fmt(d.operations.sortLabel, {
                direction: sortDesc ? d.operations.sortDesc : d.operations.sortAsc,
              })}
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Card className="min-w-0 lg:col-span-7">
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4">
                    <PageLoading title={d.operations.loadingWorkload} lines={4} />
                  </div>
                ) : sorted.length === 0 ? (
                  <EmptyState title={d.operations.emptyLawyersTitle} description={d.operations.emptyLawyersDesc} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{d.operations.colLawyer}</TableHead>
                        <TableHead>{d.operations.colWorkload}</TableHead>
                        <TableHead>{d.operations.colRoles}</TableHead>
                        <TableHead>{d.operations.colNearDeadline}</TableHead>
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((s) => {
                        const isRecommended = s.userId === recommended?.userId;
                        const isSelected = selectedUserId === s.userId;
                        return (
                          <TableRow
                            key={s.userId}
                            className={`group cursor-pointer border-l-2 transition-colors ${
                              isSelected
                                ? 'border-l-primary bg-primary/5'
                                : isRecommended
                                  ? 'border-l-transparent bg-primary/5'
                                  : 'border-l-transparent hover:bg-muted/50'
                            }`}
                            onClick={() => setSelectedUserId(s.userId)}
                            data-state={isSelected ? 'selected' : undefined}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2.5">
                                <LawyerAvatar firstName={s.firstName} lastName={s.lastName} />
                                <span>
                                  {s.firstName} {s.lastName}
                                </span>
                                {isRecommended && (
                                  <Badge variant="default" className="gap-1">
                                    <Sparkles className="h-3 w-3" />
                                    {d.operations.badgeRecommended}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="mb-1">
                                <span className="font-medium">{fmt(d.operations.caseCount, { count: s.total })}</span>
                              </div>
                              <WorkloadBar total={s.total} max={maxTotal} />
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {fmt(d.operations.roleSummary, { lead: s.leadCount, buddy: s.buddyCount })}
                            </TableCell>
                            <TableCell>
                              {s.nearDeadlineCount > 0 ? (
                                <Badge variant="warning" className="gap-1">
                                  <AlarmClock className="h-3 w-3" />
                                  {s.nearDeadlineCount}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="min-w-0 lg:col-span-5">
              <CardContent className="p-4">
                {!selectedUserId ? (
                  <InlineEmptyState icon={MousePointerClick} title={d.operations.selectLawyerTitle} description={d.operations.selectLawyerDesc} />
                ) : detailLoading || !detail ? (
                  <PageLoading title={d.operations.loadingDetail} lines={2} />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <LawyerAvatar firstName={detail.firstName} lastName={detail.lastName} />
                      <p className="font-semibold">
                        {detail.firstName} {detail.lastName}
                      </p>
                    </div>
                    {detail.cases.length === 0 ? (
                      <InlineEmptyState title={d.operations.noActiveCasesTitle} description={d.operations.noActiveCasesDesc} />
                    ) : (
                      <ul className="space-y-2">
                        {detail.cases.map((c) => (
                          <li key={c.caseId}>
                            <Link
                              href={`/cases/${c.caseId}`}
                              className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:border-primary/40 hover:bg-muted/50"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium">{c.title}</p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <CaseStatusBadge status={c.status} />
                                  <span className="text-xs text-muted-foreground">
                                    {c.role === 'LEAD' ? d.operations.roleLead : d.operations.roleBuddy}
                                  </span>
                                </div>
                              </div>
                              {c.nearestDeadlineDays === null ? (
                                <span className="shrink-0 text-xs text-muted-foreground">{d.operations.noDeadline}</span>
                              ) : c.nearestDeadlineDays < 0 ? (
                                <Badge variant="destructive" className="shrink-0">
                                  {fmt(d.operations.overdueDays, { days: Math.abs(c.nearestDeadlineDays) })}
                                </Badge>
                              ) : c.nearestDeadlineDays <= nearDeadlineDays ? (
                                <Badge variant="warning" className="shrink-0">
                                  {fmt(d.operations.inDays, { days: c.nearestDeadlineDays })}
                                </Badge>
                              ) : (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {fmt(d.operations.inDays, { days: c.nearestDeadlineDays })}
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pairing">
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
                      <TableHead>{d.operations.colSharedCases}</TableHead>
                    </TableRow>
                  </TableHeader>
                    <TableBody>
                      {pairing.length === 0 ? (
                        <TableEmptyRow colSpan={2} title={d.operations.emptyPairingTitle} description={d.operations.emptyPairingDesc} />
                      ) : pairing.map((p) => (
                        <TableRow key={`${p.userAId}:${p.userBId}`}>
                          <TableCell className="font-medium">
                            {p.userAName} + {p.userBName}
                          </TableCell>
                          <TableCell>{p.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="onhold">
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
                        <TableCell>{item.reason}</TableCell>
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
      </Tabs>
    </div>
  );
}
