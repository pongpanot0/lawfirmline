'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, OwnerKpis } from '@/lib/api';
import { caseStageLabel } from '@/lib/stage-labels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InlineEmptyState, TableEmptyRow } from '@/components/ui/misc';
import { formatCurrency } from '@/lib/utils';

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

  useEffect(() => {
    setLoading(true);
    api
      .getOwnerKpis(token, month)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setHidden(true);
          return;
        }
      })
      .finally(() => setLoading(false));
  }, [token, month]);

  if (hidden) return null;
  if (loading && !data) return null;
  if (!data) return null;

  const revenueChange =
    data.revenue.previousMonth !== 0
      ? ((data.revenue.month - data.revenue.previousMonth) / data.revenue.previousMonth) * 100
      : null;

  return (
    <div className="mb-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">ภาพรวมเจ้าของสำนักงาน</h2>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="flex h-9 rounded-lg border border-input bg-card px-3 py-1 text-sm shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">ถึงงวดแต่ยังไม่วางบิล</p>
            <p className="mt-2 text-2xl font-bold">{formatCurrency(data.unbilled.amount)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{data.unbilled.caseCount} คดี</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">อัตราเก็บเงินได้</p>
            <p className="mt-2 text-2xl font-bold">{pct(data.collectionRate.value)}</p>
            {data.collectionRate.value != null && data.collectionRate.value < data.collectionRate.target && (
              <p className="mt-1 text-xs font-medium text-destructive">ต่ำกว่าเป้า 95%</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">หนี้ค้างเฉลี่ย</p>
            <p className="mt-2 text-2xl font-bold">
              {data.avgDaysOutstanding != null ? `${data.avgDaysOutstanding} วัน` : '—'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">รายได้เดือนนี้</p>
            <p className="mt-2 text-2xl font-bold">{formatCurrency(data.revenue.month)}</p>
            {revenueChange != null && (
              <p
                className={`mt-1 text-xs font-medium ${
                  revenueChange >= 0 ? 'text-emerald-600' : 'text-destructive'
                }`}
              >
                {revenueChange >= 0 ? '+' : ''}
                {Math.round(revenueChange)}% เทียบเดือนก่อน
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
                    <span className="w-32 shrink-0 truncate text-sm">{caseStageLabel(row.stage)}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max((row.count / max) * 100, 6)}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {row.count}
                    </span>
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
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
                    <TableCell className="text-right">{row.openCases}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.billed)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.collected)}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
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
