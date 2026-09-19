'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, AiUsageSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/misc';

const OPERATION_LABELS: Record<string, string> = {
  rag_qa: 'ถาม-ตอบจากสำนวน',
  embed_document: 'ทำดัชนีเอกสาร',
  embed_query: 'ค้นหา (embedding)',
  ocr: 'OCR เอกสารสแกน',
};

const WINDOWS = [7, 30, 90] as const;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatUsd(n: number): string {
  return n > 0 ? `$${n.toFixed(n < 0.1 ? 4 : 2)}` : '—';
}

function BucketTable({
  rows,
}: {
  rows: Array<{ label: string; href?: string; runs: number; inputTokens: number; outputTokens: number; estimatedUsd: number }>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="pb-2 font-medium"> </th>
          <th className="pb-2 text-right font-medium">ครั้ง</th>
          <th className="pb-2 text-right font-medium">Tokens เข้า</th>
          <th className="pb-2 text-right font-medium">Tokens ออก</th>
          <th className="pb-2 text-right font-medium">ค่าใช้จ่ายโดยประมาณ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t border-border">
            <td className="py-2 pr-2">
              {row.href ? (
                <Link href={row.href} className="text-primary hover:underline">
                  {row.label}
                </Link>
              ) : (
                row.label
              )}
            </td>
            <td className="py-2 text-right tabular-nums">{row.runs}</td>
            <td className="py-2 text-right tabular-nums">{formatTokens(row.inputTokens)}</td>
            <td className="py-2 text-right tabular-nums">{formatTokens(row.outputTokens)}</td>
            <td className="py-2 text-right tabular-nums">{formatUsd(row.estimatedUsd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AiUsagePage() {
  const { token } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setSummary(null);
    setError('');
    api
      .getAiUsageSummary(token, days)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ'));
  }, [token, days]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!summary) return <PageLoading title="กำลังโหลดการใช้งาน AI..." lines={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">การใช้งาน AI</h1>
          <p className="text-sm text-muted-foreground">
            ค่าใช้จ่ายเป็นประมาณการจากจำนวน tokens ตามราคาโมเดล — โมเดลที่ไม่รู้ราคาแสดงเฉพาะ tokens
          </p>
        </div>
        <div role="group" aria-label="ช่วงเวลา" className="flex rounded-md border border-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={days === w}
              onClick={() => setDays(w)}
              className={
                days === w
                  ? 'rounded px-3 py-1 text-sm font-semibold bg-primary text-primary-foreground'
                  : 'rounded px-3 py-1 text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {w} วัน
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'จำนวนครั้ง', value: String(summary.total.runs) },
          { label: 'Tokens เข้า', value: formatTokens(summary.total.inputTokens) },
          { label: 'Tokens ออก', value: formatTokens(summary.total.outputTokens) },
          { label: 'ค่าใช้จ่ายโดยประมาณ', value: formatUsd(summary.total.estimatedUsd) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {summary.errors > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          มีการเรียก AI ที่ผิดพลาด {summary.errors} ครั้งในช่วงนี้
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ตามประเภทงาน</CardTitle>
        </CardHeader>
        <CardContent>
          <BucketTable
            rows={summary.byOperation.map((r) => ({ ...r, label: OPERATION_LABELS[r.key] ?? r.key }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ตามโมเดล</CardTitle>
        </CardHeader>
        <CardContent>
          <BucketTable rows={summary.byModel.map((r) => ({ ...r, label: r.key }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">คดีที่ใช้ AI มากที่สุด</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.byCase.length ? (
            <BucketTable
              rows={summary.byCase.map((r) => ({
                ...r,
                label: r.ownRef ? `${r.ownRef} — ${r.title ?? ''}` : (r.title ?? r.caseId),
                href: `/cases/${r.caseId}`,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">ยังไม่มีการใช้ AI ในคดีช่วงนี้</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
