'use client';

import { BarChart3, PieChart, TrendingUp, Download } from 'lucide-react';
import { PageHeader, KpiCard } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

const REPORTS = [
  { title: 'Case Volume by Type', desc: 'Breakdown of cases by practice area', icon: PieChart },
  { title: 'Revenue by Lawyer', desc: 'Billable hours and revenue per attorney', icon: BarChart3 },
  { title: 'Court Appearance Log', desc: 'Hearings attended per month', icon: TrendingUp },
  { title: 'Expense Summary', desc: 'Reimbursements and petty cash usage', icon: BarChart3 },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="Analytics and insights for firm management"
        actions={<Button variant="outline" size="sm"><Download className="h-4 w-4" />Export All</Button>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Cases Closed (YTD)" value={12} trend="up" change="+3 vs last year" />
        <KpiCard label="Win Rate" value="78%" trend="up" change="Based on closed cases" />
        <KpiCard label="Avg. Case Duration" value="4.2 mo" trend="neutral" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.title} className="cursor-pointer hover:shadow-card transition-shadow">
              <CardHeader className="flex-row items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">{r.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-32 rounded-lg bg-muted/50 flex items-center justify-center text-sm text-muted-foreground">
                  Chart preview — connect to analytics API
                </div>
                <p className="mt-3 text-lg font-bold">{formatCurrency(Math.floor(Math.random() * 500000))}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
