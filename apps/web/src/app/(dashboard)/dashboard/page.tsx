'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, DashboardStats } from '@/lib/api';
import { PageHeader, KpiCard, QuickActionButton } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { MyDayPanel } from '@/components/agenda/MyDayPanel';
import { FirmRole } from '@lawfirm/shared';
import { fmt } from '@/lib/i18n/dashboard';

export default function DashboardPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const router = useRouter();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken) {
      setLoading(false);
      return;
    }
    setError('');
    api
      .getDashboardStats(authToken)
      .then(setData)
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

  /**
   * The firm's money is the owner's question. A lawyer opening the app wants
   * what is overdue, what is on today and what is waiting on them — so that is
   * what they land on, with the case list one click away.
   */
  if (user.firmRole !== FirmRole.OWNER) {
    return (
      <div className="space-y-4">
        <PageHeader
          title={fmt(d.home.welcome, { name: user.firstName })}
          description={data.firmName}
          actions={
            <div className="flex flex-wrap gap-2">
              <QuickActionButton icon={Briefcase} label={d.nav.cases} onClick={() => router.push('/cases')} />
              <QuickActionButton icon={Plus} label={d.nav.intake} onClick={() => router.push('/intake/new')} />
            </div>
          }
        />
        <MyDayPanel showHeader={false} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={d.home.title}
        description={fmt(d.home.welcome, { name: user.firstName }) + ` · ${data.firmName}`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {/*
          No `change`/`trend` here: nothing computes a comparison, and the
          arrow this used to show was hardcoded — an owner reading "+12% vs
          last month" off a constant is worse served than by no figure at all.
        */}
        <KpiCard label={d.home.totalCases} value={data.stats.totalCases} icon={Briefcase} />
        <KpiCard label={d.home.activeCases} value={data.stats.openCases} icon={Activity} change={d.home.inProgress} trend="neutral" />
        <KpiCard label={d.home.upcomingHearings} value={data.stats.upcomingEvents} icon={CalendarDays} change={d.home.next30Days} trend="neutral" />
        <KpiCard label={d.home.monthlyRevenue} value={formatCurrency(data.stats.monthlyRevenue)} icon={Banknote} change={d.home.thisMonth} trend="neutral" />
        <KpiCard label={d.home.totalNetProfit} value={formatCurrency(data.stats.totalNetProfit)} icon={TrendingUp} change={d.home.profitHint} trend={data.stats.totalNetProfit >= 0 ? 'up' : 'down'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
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
