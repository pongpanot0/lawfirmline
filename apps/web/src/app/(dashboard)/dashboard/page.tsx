'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TaskStatus } from '@lawfirm/shared';
import {
  Briefcase,
  Activity,
  CalendarDays,
  Banknote,
  Plus,
  Gavel,
  Upload,
  UserPlus,
  FileText,
  CheckCircle2,
  TrendingUp,
  PauseCircle,
  CalendarDays as CalendarDaysIcon,
} from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ActiveTask, DashboardStats, MyDayResponse } from '@/lib/api';
import { AgendaRow } from '@/components/lexflow/AgendaRow';
import { PageHeader, KpiCard, QuickActionButton } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

/** Reads a task's own status, so a paused task never looks like it is moving. */
function ActiveTaskRow({ task }: { task: ActiveTask }) {
  const d = useDashboardT();
  const statusLabel = {
    [TaskStatus.TODO]: d.todos.columnTodo,
    [TaskStatus.IN_PROGRESS]: d.todos.columnInProgress,
    [TaskStatus.PENDING_REVIEW]: d.todos.columnPendingReview,
    [TaskStatus.NEEDS_REVISION]: d.todos.columnNeedsRevision,
    [TaskStatus.DONE]: d.todos.columnDone,
  }[task.status];

  return (
    <Link
      href={task.caseId ? `/cases/${task.caseId}/tasks` : '/todos'}
      className="block rounded-lg px-2 py-1.5 transition hover:bg-muted/50"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{task.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{statusLabel}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {task.caseRef && <span className="font-mono">{task.caseRef}</span>}
        <span>
          {task.dueDate ? fmt(d.home.dueOn, { date: formatDate(task.dueDate) }) : d.home.noDueDate}
        </span>
      </div>
      {task.onHold && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
          <PauseCircle className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{fmt(d.home.onHoldFor, { reason: task.onHold.reason })}</span>
        </p>
      )}
    </Link>
  );
}

export default function DashboardPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const router = useRouter();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [myDay, setMyDay] = useState<MyDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    Promise.all([api.getDashboardStats(authToken), api.getMyDay(authToken)])
      .then(([stats, day]) => {
        setData(stats);
        setMyDay(day);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.common.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token, d.common.loadFailed]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!data || !user) return null;

  return (
    <div>
      <PageHeader
        title={d.home.title}
        description={fmt(d.home.welcome, { name: user.firstName }) + ` · ${data.firmName}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label={d.home.totalCases} value={data.stats.totalCases} icon={Briefcase} change={d.home.changeThisMonth} trend="up" />
        <KpiCard label={d.home.activeCases} value={data.stats.openCases} icon={Activity} change={d.home.inProgress} trend="neutral" />
        <KpiCard label={d.home.upcomingHearings} value={data.stats.upcomingEvents} icon={CalendarDays} change={d.home.next30Days} trend="neutral" />
        <KpiCard label={d.home.monthlyRevenue} value={formatCurrency(data.stats.monthlyRevenue)} icon={Banknote} change={d.home.revenueChange} trend="up" />
        <KpiCard label={d.home.totalNetProfit} value={formatCurrency(data.stats.totalNetProfit)} icon={TrendingUp} change={d.home.profitHint} trend={data.stats.totalNetProfit >= 0 ? 'up' : 'down'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CalendarDaysIcon className="size-4 text-muted-foreground" aria-hidden />
                {d.home.todayAgenda}
                {myDay && myDay.overdue.length > 0 && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    {fmt(d.home.overdueBadge, { count: myDay.overdue.length })}
                  </span>
                )}
              </CardTitle>
              <Link href="/my-day" className="text-sm text-primary hover:underline">
                {d.common.viewAll}
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {!myDay || myDay.todayItems.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">{d.home.noAgendaToday}</p>
              ) : (
                <div className="-mx-1 divide-y divide-border/60">
                  {myDay.todayItems.map((item) => (
                    <AgendaRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{d.home.caseProfitByCase}</CardTitle>
              <Link href="/expenses" className="text-sm text-primary hover:underline">{d.common.viewAll}</Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{d.home.ownRef}</TableHead>
                    <TableHead>{d.home.client}</TableHead>
                    <TableHead className="text-right">{d.home.revenue}</TableHead>
                    <TableHead className="text-right">{d.home.profit}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data.caseProfits ?? []).map((row) => (
                    <TableRow key={row.caseId}>
                      <TableCell>
                        <Link href={`/cases/${row.caseId}`} className="font-medium text-primary hover:underline">
                          {row.ownRef}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground max-w-[140px]">{row.title}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.clientName ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {formatCurrency(row.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(data.caseProfits ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {d.cases.empty}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{d.home.upcomingCourt}</CardTitle>
              <Link href="/court-schedule" className="text-sm text-primary hover:underline">{d.common.viewAll}</Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{d.home.date}</TableHead>
                    <TableHead>{d.home.ownRef}</TableHead>
                    <TableHead>{d.home.client}</TableHead>
                    <TableHead>{d.home.court}</TableHead>
                    <TableHead>{d.billing.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.upcomingHearings.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{formatDate(e.startAt)}</TableCell>
                      <TableCell>
                        <Link href={`/cases/${e.caseId}`} className="text-primary hover:underline">
                          {e.case.ownRef}
                        </Link>
                        <p className="text-xs text-muted-foreground">{e.case.title}</p>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.case.client?.name ?? e.case.clientName ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.case.courtName ?? '—'}</TableCell>
                      <TableCell><CaseStatusBadge status="COURT_DATE" /></TableCell>
                    </TableRow>
                  ))}
                  {data.upcomingHearings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        {d.home.noUpcomingCourt}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{d.home.recentActivities}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-0">
                {[...data.recentCases.slice(0, 4).map((c) => ({
                  icon: Briefcase,
                  label: fmt(d.home.caseUpdated, { ownRef: c.ownRef }),
                  time: d.home.recently,
                }))].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex gap-4 pb-6 last:pb-0">
                      <div className="relative flex flex-col items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        {i < 3 && <div className="absolute top-8 h-full w-px bg-border" />}
                      </div>
                      <div className="pt-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{d.home.activeWork}</CardTitle>
              <Link href="/todos" className="text-sm text-primary hover:underline">
                {d.common.viewAll}
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {(data.activeTasks ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{d.home.noActiveWork}</p>
              ) : (
                (data.activeTasks ?? []).map((task) => (
                  <ActiveTaskRow key={task.id} task={task} />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{d.home.quickActions}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QuickActionButton label={d.home.newCase} icon={Plus} onClick={() => router.push('/cases/new')} />
              <QuickActionButton label={d.home.addHearing} icon={Gavel} onClick={() => router.push('/court-schedule')} />
              <QuickActionButton label={d.home.uploadDocument} icon={Upload} onClick={() => router.push('/documents')} />
              <QuickActionButton label={d.home.addClient} icon={UserPlus} onClick={() => router.push('/clients')} />
            </CardContent>
          </Card>

          {data.pendingReimbursements.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{d.home.pendingExpenses}</CardTitle>
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {data.pendingReimbursements.length}
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.pendingReimbursements.slice(0, 3).map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium truncate max-w-[140px]">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.case?.ownRef ?? 'General / ทั่วไป'}</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(e.amount)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{d.home.tasksDue}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>{fmt(d.home.overdueTasks, { count: data.stats.overdueTasks })}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{fmt(d.home.myTasks, { count: data.stats.myTasks })}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
