'use client';

import { useEffect, useState } from 'react';
import { BarChart3, PieChart, TrendingUp } from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ReportsSummary } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

/** Copy lives in the dictionary; this only fixes the order and the icons. */
const REPORT_META = [
  { key: 'caseVolumeByType' as const, titleKey: 'caseVolumeByType' as const, descKey: 'caseVolumeHint' as const, icon: PieChart },
  { key: 'revenueByLawyer' as const, titleKey: 'revenueByLawyer' as const, descKey: 'revenueByLawyerHint' as const, icon: BarChart3 },
  { key: 'courtAppearancesByMonth' as const, titleKey: 'courtAppearanceLog' as const, descKey: 'courtAppearanceHint' as const, icon: TrendingUp },
  { key: 'expenseSummary' as const, titleKey: 'expenseSummary' as const, descKey: 'expenseSummaryHint' as const, icon: BarChart3 },
];

function MiniBarChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const d = useDashboardT();
  const max = Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {d.reports.noData}
      </div>
    );
  }

  return (
    <div className="flex h-32 items-end gap-2">
      {items.slice(0, 6).map((item) => (
        <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-primary/70"
            style={{ height: `${Math.max((item.value / max) * 100, 8)}%` }}
          />
          <span className="truncate text-[10px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function reportTotal(data: ReportsSummary, key: (typeof REPORT_META)[number]['key']) {
  switch (key) {
    case 'caseVolumeByType':
      return data.caseVolumeByType.reduce((sum, row) => sum + row.count, 0);
    case 'revenueByLawyer':
      return data.revenueByLawyer.reduce((sum, row) => sum + row.revenue, 0);
    case 'courtAppearancesByMonth':
      return data.courtAppearancesByMonth.reduce((sum, row) => sum + row.count, 0);
    case 'expenseSummary':
      return data.expenseSummary.total;
  }
}

function reportChartItems(data: ReportsSummary, key: (typeof REPORT_META)[number]['key']) {
  switch (key) {
    case 'caseVolumeByType':
      return data.caseVolumeByType.map((row) => ({ label: row.label, value: row.count }));
    case 'revenueByLawyer':
      return data.revenueByLawyer.map((row) => ({
        label: row.lawyerName.split(' ')[0],
        value: row.revenue,
      }));
    case 'courtAppearancesByMonth':
      return data.courtAppearancesByMonth.map((row) => ({
        label: row.month.slice(5),
        value: row.count,
      }));
    case 'expenseSummary':
      return data.expenseSummary.byCategory.map((row) => ({
        label: row.category,
        value: row.amount,
      }));
  }
}

export default function ReportsPage() {
  const d = useDashboardT();
  const { user, token } = useAuth();
  const [data, setData] = useState<ReportsSummary | null>(null);
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
      .getReportsSummary(authToken)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : d.reports.loadFailed);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
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

  const changeLabel =
    data.kpis.casesClosedChange >= 0
      ? `+${data.kpis.casesClosedChange} ${d.reports.vsLastYear}`
      : `${data.kpis.casesClosedChange} ${d.reports.vsLastYear}`;

  return (
    <div>
      <PageHeader
        title={d.reports.title}
        description={
          data.scope === 'user'
            ? fmt(d.reports.descriptionMine, { firm: data.firmName })
            : fmt(d.reports.descriptionOwner, { firm: data.firmName })
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={d.reports.casesClosedYtd}
          value={data.kpis.casesClosedYtd}
          trend={data.kpis.casesClosedChange >= 0 ? 'up' : 'down'}
          change={changeLabel}
        />
        <KpiCard
          label={d.reports.completionRate}
          value={`${data.kpis.winRate}%`}
          trend="neutral"
          change={d.reports.completionRateHint}
        />
        <KpiCard
          label={d.reports.avgCaseDuration}
          value={
            data.kpis.avgCaseDurationMonths != null
              ? fmt(d.reports.months, { count: data.kpis.avgCaseDurationMonths })
              : '—'
          }
          trend="neutral"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORT_META.map((report) => {
          const Icon = report.icon;
          const total = reportTotal(data, report.key);
          const chartItems = reportChartItems(data, report.key);

          return (
            <Card key={report.key} className="transition-shadow hover:shadow-card">
              <CardHeader className="flex-row items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{d.reports[report.titleKey]}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{d.reports[report.descKey]}</p>
                </div>
              </CardHeader>
              <CardContent>
                <MiniBarChart items={chartItems} />
                <p className="mt-3 text-lg font-bold">
                  {report.key === 'caseVolumeByType'
                    ? fmt(d.reports.caseCount, { count: total })
                    : report.key === 'courtAppearancesByMonth'
                      ? fmt(d.reports.hearingCount, { count: total })
                      : formatCurrency(total)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
