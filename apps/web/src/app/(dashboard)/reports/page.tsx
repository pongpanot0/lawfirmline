'use client';

import { useEffect, useState } from 'react';
import { BarChart3, PieChart, TrendingUp, Download } from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ReportsSummary } from '@/lib/api';
import { PageHeader, KpiCard } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';

const REPORT_META = [
  {
    key: 'caseVolumeByType' as const,
    title: 'Case Volume by Type / จำนวนคดีตามประเภท',
    desc: 'Breakdown of cases by practice area / แยกตามประเภทคดี',
    icon: PieChart,
  },
  {
    key: 'revenueByLawyer' as const,
    title: 'Revenue by Lawyer / รายได้ต่อทนายความ',
    desc: 'Billable hours and revenue per attorney / ชั่วโมงคิดค่าบริการและรายได้ต่อคน',
    icon: BarChart3,
  },
  {
    key: 'courtAppearancesByMonth' as const,
    title: 'Court Appearance Log / บันทึกการขึ้นศาล',
    desc: 'Hearings attended per month / จำนวนนัดศาลต่อเดือน',
    icon: TrendingUp,
  },
  {
    key: 'expenseSummary' as const,
    title: 'Expense Summary / สรุปค่าใช้จ่าย',
    desc: 'Reimbursements and petty cash usage / การเบิกจ่ายและเงินสดย่อย',
    icon: BarChart3,
  },
];

function MiniBarChart({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((i) => i.value), 1);

  if (items.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No data yet / ยังไม่มีข้อมูล
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
        setError(err instanceof Error ? err.message : 'Failed to load reports / โหลดรายงานไม่สำเร็จ');
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
      ? `+${data.kpis.casesClosedChange} vs last year / เทียบปีก่อน`
      : `${data.kpis.casesClosedChange} vs last year / เทียบปีก่อน`;

  return (
    <div>
      <PageHeader
        title="Reports / รายงาน"
        description={
          data.scope === 'user'
            ? `Your analytics / ข้อมูลของคุณ · ${data.firmName}`
            : `Analytics and insights for / ข้อมูลวิเคราะห์ของ ${data.firmName}`
        }
        actions={
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Export All / ส่งออกทั้งหมด
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Cases Closed (YTD) / คดีปิดปีนี้"
          value={data.kpis.casesClosedYtd}
          trend={data.kpis.casesClosedChange >= 0 ? 'up' : 'down'}
          change={changeLabel}
        />
        <KpiCard
          label="Completion Rate / อัตราปิดคดี"
          value={`${data.kpis.winRate}%`}
          trend="neutral"
          change="Closed cases / total cases / คดีปิด ÷ คดีทั้งหมด"
        />
        <KpiCard
          label="Avg. Case Duration / ระยะเวลาคดีเฉลี่ย"
          value={
            data.kpis.avgCaseDurationMonths != null
              ? `${data.kpis.avgCaseDurationMonths} mo / เดือน`
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
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{report.desc}</p>
                </div>
              </CardHeader>
              <CardContent>
                <MiniBarChart items={chartItems} />
                <p className="mt-3 text-lg font-bold">
                  {report.key === 'caseVolumeByType'
                    ? `${total} cases / คดี`
                    : report.key === 'courtAppearancesByMonth'
                      ? `${total} hearings / นัด`
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
