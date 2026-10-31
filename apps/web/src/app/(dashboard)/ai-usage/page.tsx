'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, AiUsageSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { KpiStrip } from '@/components/reports/KpiStrip';

const OPERATION_LABELS: Record<string, string> = {
  rag_qa: 'ถาม-ตอบจากสำนวน',
  embed_document: 'ทำดัชนีเอกสาร',
  embed_query: 'ค้นหา (embedding)',
  ocr: 'OCR เอกสารสแกน',
  secretary_chat: 'เลขา AI (ถาม-ตอบ)',
  secretary_transcribe: 'เลขา AI (ถอดเสียง)',
  daily_brief: 'สรุปประจำวัน',
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
  if (!rows.length) return <InlineEmptyState title="ยังไม่มีการใช้งานในช่วงนี้" />;
  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[32rem] text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="pb-2 font-medium"><span className="sr-only">รายการ</span></th>
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
    </div>
  );
}

export default function AiUsagePage() {
  const { token } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!token) return;
    setSummary(null);
    setError('');
    api
      .getAiUsageSummary(token, days)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ'));
  }, [token, days, reload]);

  const header = (
    <PageHeader
      title="การใช้งาน AI"
      description="ค่าใช้จ่ายประมาณจาก tokens ตามราคาโมเดล โมเดลที่ไม่ทราบราคาแสดงเฉพาะ tokens"
      actions={
        <div role="group" aria-label="ช่วงเวลา" className="flex rounded-lg border border-border p-0.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={days === w}
              onClick={() => setDays(w)}
              className={`min-h-10 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                days === w ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w} วัน
            </button>
          ))}
        </div>
      }
    />
  );

  if (error) return <div>{header}<LoadFailed message={error} onRetry={() => setReload((n) => n + 1)} /></div>;
  if (!summary) return <PageLoading title="กำลังโหลดการใช้งาน AI" lines={4} />;

  return (
    <div className="space-y-6">
      {header}

      <KpiStrip items={[
        { label: 'จำนวนครั้ง', value: String(summary.total.runs) },
        { label: 'Tokens เข้า', value: formatTokens(summary.total.inputTokens) },
        { label: 'Tokens ออก', value: formatTokens(summary.total.outputTokens) },
        { label: 'ค่าใช้จ่ายโดยประมาณ', value: formatUsd(summary.total.estimatedUsd) },
      ]} />

      {summary.errors > 0 && (
        <p role="status" className="text-sm text-warning">
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
            <InlineEmptyState title="ยังไม่มีการใช้ AI ในคดีช่วงนี้" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
