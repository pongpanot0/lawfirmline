'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, FirmMetrics, FirmMetricsPeriod } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton, TableEmptyRow } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatCurrency } from '@/lib/utils';

const PERIODS: Array<{ value: FirmMetricsPeriod; label: string }> = [
  { value: 'this_month', label: 'เดือนนี้' },
  { value: 'last_month', label: 'เดือนที่แล้ว' },
  { value: 'quarter', label: 'ไตรมาส' },
  { value: 'year', label: 'ปีนี้' },
];

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const hrs = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 1 });

export function FirmMetricsSection({ token }: { token: string }) {
  const [period, setPeriod] = useState<FirmMetricsPeriod>('this_month');
  const [data, setData] = useState<FirmMetrics | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    api
      .getFirmMetrics(token, period)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) return setHidden(true);
        setFailed(true);
      })
      .finally(() => setLoading(false));
  }, [token, period, reload]);

  if (hidden) return null;
  if (loading && !data) {
    return <div role="status" aria-label="กำลังโหลดตัวชี้วัดสำนักงาน" className="mb-6"><Skeleton className="h-40 w-full rounded-lg" /></div>;
  }
  if (!data) {
    return failed ? (
      <div className="mb-6"><LoadFailed message="โหลดตัวชี้วัดสำนักงานไม่สำเร็จ" onRetry={() => setReload((n) => n + 1)} /></div>
    ) : null;
  }

  const billed = data.timeBasedBilling;
  const row = (r: FirmMetrics['firm'] | FirmMetrics['members'][number]) => (
    <>
      <TableCell className="text-right tabular-nums">{hrs(r.workedHours)}</TableCell>
      <TableCell className="text-right tabular-nums">{r.targetMonthly != null ? hrs(r.targetMonthly) : (
        <>— <Link href="/team" className="text-xs underline">ตั้งเป้า</Link></>
      )}</TableCell>
      <TableCell className="text-right tabular-nums">{pct(r.utilization)}</TableCell>
      {billed && <TableCell className="text-right tabular-nums">{pct(r.realization)}</TableCell>}
      {billed && <TableCell className="text-right tabular-nums">{pct(r.collection)}</TableCell>}
      <TableCell className="text-right tabular-nums">{formatCurrency(r.invoicedAmount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(r.collectedAmount)}</TableCell>
    </>
  );

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>ชั่วโมงทำงานและการเก็บเงิน</CardTitle>
        <select
          aria-label="ช่วงเวลา"
          value={period}
          onChange={(e) => setPeriod(e.target.value as FirmMetricsPeriod)}
          className="flex h-10 rounded-lg border border-input bg-card px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        {!billed && <p className="text-sm text-muted-foreground">สำนักงานไม่ได้วางบิลจากเวลา</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ</TableHead>
              <TableHead className="text-right">ชม.ที่ทำ</TableHead>
              <TableHead className="text-right">เป้า/เดือน</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
              {billed && <TableHead className="text-right">Realization</TableHead>}
              {billed && <TableHead className="text-right">Collection</TableHead>}
              <TableHead className="text-right">ยอดวางบิล</TableHead>
              <TableHead className="text-right">ยอดเก็บได้</TableHead>
              <TableHead className="text-right">ร่างรอยืนยัน (7 วัน)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40 font-medium">
              <TableCell>ทั้งสำนักงาน</TableCell>
              {row(data.firm)}
              <TableCell />
            </TableRow>
            {data.members.length === 0 ? (
              <TableEmptyRow colSpan={billed ? 9 : 7} title="ยังไม่มีสมาชิก" />
            ) : data.members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell>{m.name}</TableCell>
                {row(m)}
                <TableCell className="text-right tabular-nums">{m.pendingDrafts7d}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
