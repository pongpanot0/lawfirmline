'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, OwnerKpis } from '@/lib/api';
import { caseStageLabel } from '@/lib/stage-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InlineEmptyState, TableEmptyRow } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';
import { KpiStrip } from './KpiStrip';
import { LoadFailed } from '@/components/ui/LoadFailed';

function monthOptions() {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    options.push({ value, label });
  }
  return options;
}

function pct(value: number | null) {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

export function OwnerKpiSection({ token }: { token: string }) {
  const months = useMemo(monthOptions, []);
  const [month, setMonth] = useState(months[0].value);
  const [data, setData] = useState<OwnerKpis | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    api
      .getOwnerKpis(token, month)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setHidden(true);
          return;
        }
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [token, month, reload]);

  if (hidden) return null;
  if (loading && !data) return <div role="status" aria-label="กำลังโหลดภาพรวมเจ้าของสำนักงาน" className="mb-6"><Skeleton className="h-28 w-full rounded-lg" /></div>;
  if (!data) {
    return failed ? (
      <div className="mb-6"><LoadFailed message="โหลดภาพรวมเจ้าของสำนักงานไม่สำเร็จ" onRetry={() => setReload((n) => n + 1)} /></div>
    ) : null;
  }

  const revenueChange =
    data.revenue.previousMonth !== 0
      ? ((data.revenue.month - data.revenue.previousMonth) / data.revenue.previousMonth) * 100
      : null;

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">ภาพรวมเจ้าของสำนักงาน</h2>
        <select
          aria-label="เดือน"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="flex h-10 rounded-lg border border-input bg-card px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <KpiStrip items={[
        {
          label: 'ถึงงวดแต่ยังไม่วางบิล',
          value: formatCurrency(data.unbilled.amount),
          note: `${data.unbilled.hours.toLocaleString('th-TH')} ชม. · ${data.unbilled.caseCount} คดี`,
        },
        {
          label: 'อัตราเก็บเงินได้',
          value: pct(data.collectionRate.value),
          note: data.collectionRate.value != null && data.collectionRate.value < data.collectionRate.target
            ? <span className="font-medium text-destructive">ต่ำกว่าเป้า 95%</span>
            : undefined,
        },
        { label: 'หนี้ค้างเฉลี่ย', value: data.avgDaysOutstanding != null ? `${data.avgDaysOutstanding} วัน` : '—' },
        {
          label: 'เงินรับเดือนนี้',
          value: formatCurrency(data.revenue.month),
          note: revenueChange != null
            ? <span className={`font-medium ${revenueChange >= 0 ? 'text-success' : 'text-destructive'}`}>{revenueChange >= 0 ? '+' : ''}{Math.round(revenueChange)}% เทียบเดือนก่อน</span>
            : undefined,
        },
      ]} />

      <Card>
        <CardHeader>
          <CardTitle>คดีที่ค้างอยู่ตามขั้นตอน</CardTitle>
        </CardHeader>
        <CardContent>
          {data.stuckByStage.length === 0 ? (
            <InlineEmptyState title="ไม่มีคดีค้าง" description="ทุกคดีเคลื่อนไหวตามปกติ" />
          ) : (
            <div className="space-y-2">
              {data.stuckByStage.map((row) => {
                const max = Math.max(...data.stuckByStage.map((r) => r.count), 1);
                return (
                  <div key={row.stage} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-sm sm:w-32">{caseStageLabel(row.stage)}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max((row.count / max) * 100, 6)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {row.count}
                    </span>
                    <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:inline">
                      ค้างสุด {row.oldestDays} วัน
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สรุปตามทนาย</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ทนาย</TableHead>
                <TableHead className="text-right">คดีที่ถือ</TableHead>
                <TableHead className="text-right">วางบิล</TableHead>
                <TableHead className="text-right">เก็บได้</TableHead>
                <TableHead className="text-right">%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.byLawyer.length === 0 ? (
                <TableEmptyRow colSpan={5} title="ยังไม่มีข้อมูล" />
              ) : (
                data.byLawyer.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.openCases}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.billed)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.collected)}</TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${
                        row.rate != null && row.rate < 0.9 ? 'text-destructive' : ''
                      }`}
                    >
                      {pct(row.rate)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
