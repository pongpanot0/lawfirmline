'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, Clock, Folder, Lock, Target, Users } from 'lucide-react';
import { hasFirmCapability, PLAN_FEATURE_LOCKED } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, FinanceSummary, FirmMetrics, FirmMetricsPeriod, OwnerKpis } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { barHeight } from '@/components/reports/bar-height';
import { periodMonths } from '@/components/reports/period-months';
import { Card } from '@/components/ui/card';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { NoAccess } from '@/components/ui/NoAccess';
import { PageLoading } from '@/components/ui/misc';
import { caseStageLabel } from '@/lib/stage-labels';

const periods: { value: FirmMetricsPeriod; label: string }[] = [
  { value: 'this_month', label: 'เดือนนี้' }, { value: 'last_month', label: 'เดือนที่แล้ว' },
  { value: 'quarter', label: 'ไตรมาสนี้' }, { value: 'year', label: 'ปีนี้' },
];
const hours = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 1 });
const percent = (n: number | null) => n == null ? 'ยังไม่มีข้อมูล' : `${Math.round(n * 100)}%`;


function ProfitChart({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((item) => Math.abs(item.value)));
  if (!items.length) return <p className="py-12 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลกำไรแยกตามประเภทคดีในช่วงนี้</p>;
  return <div className="overflow-x-auto"><div className="flex min-w-[36rem] gap-4">
    {items.map((item) => <div key={item.label} className="min-w-0 flex-1 text-center">
      <div className="flex h-40 flex-col items-center justify-end border-b-2 border-muted-foreground"><span className="text-sm font-semibold">{item.value >= 0 ? formatCurrency(item.value) : ''}</span><div className="w-12 rounded-t bg-primary" style={{ height: `${barHeight(item.value, max, 'positive')}%` }} /></div>
      <div className="flex h-20 flex-col items-center"><div className="w-12 rounded-b bg-destructive" style={{ height: `${barHeight(item.value, max, 'negative')}%` }} />{item.value < 0 && <span className="text-sm text-destructive">−{formatCurrency(Math.abs(item.value))}<br />ขาดทุนในช่วงนี้</span>}</div>
      <span className="text-sm font-medium">{item.label}</span>
    </div>)}
  </div></div>;
}

export default function ReportsPage() {
  const { user, token } = useAuth();
  const [period, setPeriod] = useState<FirmMetricsPeriod>('this_month');
  const [metrics, setMetrics] = useState<FirmMetrics | null>(null);
  const [owner, setOwner] = useState<OwnerKpis | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [metricsLocked, setMetricsLocked] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const authToken = token ?? getStoredToken();
    if (!authToken || !user) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(''); setForbidden(false); setMetricsLocked(false);
    const keys = periodMonths(period);
    Promise.all([
      api.getFinanceSummary(authToken),
      hasFirmCapability(user.firmRole, 'viewFirmReports')
        ? api.getFirmMetrics(authToken, period).catch((err) => {
          // The firm's plan has no office reports: show the rest of the page, not "no access".
          if (err instanceof ApiError && (err.body as { code?: string } | undefined)?.code === PLAN_FEATURE_LOCKED) { if (active) setMetricsLocked(true); return null; }
          throw err;
        })
        : Promise.resolve(null),
      hasFirmCapability(user.firmRole, 'runOperations') ? Promise.all(keys.map((key) => api.getOwnerKpis(authToken, key))) : Promise.resolve([]),
    ]).then(([f, m, owners]) => {
      if (!active) return;
      setFinance(f); setMetrics(m); setOwner(owners.at(-1) ?? null);
      setRevenue(owners.length ? owners.reduce((sum, item) => sum + item.revenue.month, 0) : null);
    }).catch((err) => {
      if (!active) return;
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof Error ? err.message : 'โหลดรายงานไม่สำเร็จ ลองโหลดหน้าใหม่');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, user, period, reload]);

  if (loading) return <PageLoading title="กำลังโหลดรายงาน" lines={3} />;
  if (forbidden) return <NoAccess />;
  if (error) return <LoadFailed message={error} onRetry={() => setReload((n) => n + 1)} />;
  if (!user || !finance) return null;

  const periodLabel = periods.find((p) => p.value === period)!.label;
  const change = owner && (period === 'this_month' || period === 'last_month') && owner.revenue.previousMonth !== 0
    ? (owner.revenue.month - owner.revenue.previousMonth) / owner.revenue.previousMonth * 100 : null;
  const missingTargets = metrics?.members.filter((member) => member.targetMonthly == null).length ?? 0;
  const currentMonth = periodMonths(period).at(-1)!;
  const dateLabel = new Date(`${currentMonth}-01T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', month: 'long', year: 'numeric' });
  const range = metrics ? `${new Date(`${metrics.from}T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })} – ${new Date(`${metrics.to}T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })}` : periodLabel;
  const figures = [
    { title: 'เงินรับแล้ว', value: revenue == null ? null : formatCurrency(revenue), caption: 'ยอดรับชำระตามวันที่รับเงิน' },
    { title: 'ค้างวางบิล', value: owner ? formatCurrency(owner.unbilled.amount) : null, caption: 'ยอดงานและค่าใช้จ่ายที่ยังไม่วางบิล ณ ปัจจุบัน' },
    { title: 'กำไรสุทธิ', value: null, caption: 'ยังไม่มีข้อมูลกำไรแยกตามช่วงเวลา' },
  ];
  return <div className="min-w-0 space-y-6 pb-20">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold">รายงาน</h1><p className="mt-1 text-sm text-muted-foreground">เงินเข้า เงินค้าง และกำไรของสำนักงาน</p></div>
      <div className="w-full sm:w-auto"><div className="grid grid-cols-2 rounded-lg bg-muted p-1 sm:flex" role="group" aria-label="ช่วงเวลารายงาน">{periods.map((p) => <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)} className={`rounded-md px-4 py-2 text-sm ${period === p.value ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground'}`}>{p.label}</button>)}</div><p className="mt-1 text-right text-xs text-muted-foreground">ใช้เลือกช่วงเวลาของทุกส่วนในหน้านี้</p></div>
    </div>
    <Card className="border-warning/40 border-l-4 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 sm:p-6">
      <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4 text-warning" />{period === 'this_month' || period === 'last_month' ? dateLabel : periodLabel} ({range})</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-3">{figures.map((f) => <div key={f.title}><p className="text-sm text-muted-foreground">{f.title}</p><p className="mt-1 text-3xl font-bold tabular-nums">{f.value ?? <span className="text-base font-normal">ยังไม่มีข้อมูลในช่วงนี้</span>}</p><p className="mt-1 text-xs text-muted-foreground">{f.caption}</p>{f.title === 'เงินรับแล้ว' && change != null && <p className={`mt-1 flex items-center gap-1 text-xs ${change >= 0 ? 'text-success' : 'text-destructive'}`}><ArrowUpRight className={`h-4 w-4 ${change < 0 ? 'rotate-90' : ''}`} />{change >= 0 ? 'เพิ่ม' : 'ลด'} {Math.abs(Math.round(change))}% จากเดือนก่อน</p>}</div>)}</div>
      {owner && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-warning/30 pt-5"><p className="font-semibold">มี {owner.unbilled.caseCount} คดีที่มีรายการค้างวางบิล รวม {formatCurrency(owner.unbilled.amount)}</p><div className="text-right"><Link href="/invoices" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">ดูรายการวางบิล <ArrowRight className="h-4 w-4" /></Link><p className="mt-1 text-xs text-muted-foreground">ตรวจสอบรายการก่อนสร้างใบแจ้งหนี้</p></div></div>}
    </Card>
    {metricsLocked && <Card className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6"><div><p className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" aria-hidden />สรุปตามสมาชิก ชั่วโมงทำงาน และเป้าชั่วโมง</p><p className="mt-1 text-sm text-muted-foreground">รายงานภาพรวมสำนักงานมีในแพ็กเกจ Firm และ Professional</p></div><Link href="/account/billing" className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium" title="ดูและเปลี่ยนแพ็กเกจของสำนักงาน">ดูแพ็กเกจ <ArrowRight className="h-4 w-4" aria-hidden /></Link></Card>}
    <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">รายรับหักรายจ่ายตามประเภทคดี · {periodLabel}</h2><p className="text-sm text-muted-foreground">กำไรสุทธิแยกตามประเภทคดี</p></div><p className="text-xs text-muted-foreground"><span className="text-primary">■</span> บวก = กำไร　<span className="text-destructive">■</span> ใต้เส้น = ขาดทุน</p></div><div className="mt-4 border-t pt-4"><ProfitChart items={[]} /></div><p className="border-t pt-3 text-xs text-muted-foreground">ยังไม่มีข้อมูลรายรับและรายจ่ายแยกตามประเภทคดีและช่วงเวลา</p></Card>
    {metrics && <details className="rounded-lg border bg-card"><summary className="disclosure cursor-pointer p-4"><span className="flex items-center gap-3 font-semibold"><Users className="h-9 w-9 rounded border bg-muted p-2" />สรุปตามสมาชิก</span><span className="ml-auto text-right text-sm text-muted-foreground">{metrics.members.length} คน · ชั่วโมงวางบิลได้ {percent(metrics.firm.realization)}</span></summary><div className="space-y-2 border-t p-4">{metrics.members.map((m) => <div key={m.userId} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{m.name}</span><span>ทำงาน {hours(m.workedHours)} ชม. · วางบิล {formatCurrency(m.invoicedAmount)} · เก็บได้ {formatCurrency(m.collectedAmount)}</span></div>)}<p className="text-xs text-muted-foreground">ยอดตามชั่วโมงที่บันทึกในช่วงที่เลือก</p>{owner && owner.byLawyer.length > 0 && <div className="pt-3"><p className="font-medium">คดีที่ถือและยอดใบแจ้งหนี้ตามผู้รับผิดชอบ</p><p className="text-xs text-muted-foreground">คดีที่เปิดอยู่ ณ ปัจจุบันและใบแจ้งหนี้ย้อนหลังหนึ่งปี</p>{owner.byLawyer.map((m) => <p key={m.userId} className="py-1 text-sm">{m.name} · {m.openCases} คดี · วางบิล {formatCurrency(m.billed)} · เก็บได้ {formatCurrency(m.collected)}</p>)}</div>}{owner && owner.stuckByStage.length > 0 && <div className="pt-3"><p className="font-medium">คดีที่ค้างอยู่ตามขั้นตอน ณ ปัจจุบัน</p>{owner.stuckByStage.map((s) => <p key={s.stage} className="text-sm">{caseStageLabel(s.stage)} · {s.count} คดี · ค้างสุด {s.oldestDays} วัน</p>)}</div>}</div></details>}
    {metrics && <details className="rounded-lg border bg-card"><summary className="disclosure cursor-pointer p-4"><span className="flex items-center gap-3 font-semibold"><Clock className="h-9 w-9 rounded border bg-muted p-2" />ชั่วโมงทำงาน</span><span className="ml-auto text-right text-sm text-muted-foreground">{hours(metrics.firm.workedHours)} ชม. · วางบิลแล้ว {hours(metrics.firm.invoicedHours)} ชม.</span></summary><div className="space-y-2 border-t p-4">{metrics.members.map((m) => <p key={m.userId} className="text-sm">{m.name} · ทำงาน {hours(m.workedHours)} ชม. · วางบิล {hours(m.invoicedHours)} ชม.</p>)}</div></details>}
    <details className="rounded-lg border bg-card"><summary className="disclosure cursor-pointer p-4"><span className="flex items-center gap-3 font-semibold"><Folder className="h-9 w-9 rounded border bg-muted p-2" />กำไรแต่ละคดี</span><span className="ml-auto text-right text-sm text-muted-foreground">{finance.caseProfits.length} คดี · ข้อมูลสะสม</span></summary><div className="space-y-2 border-t p-4"><p className="text-xs text-muted-foreground">ข้อมูลสะสมทั้งหมด ส่วนนี้ยังกรองตามช่วงเวลาไม่ได้</p>{finance.caseProfits.length ? finance.caseProfits.map((c) => <Link key={c.caseId} href={`/cases/${c.caseId}`} className="flex flex-wrap justify-between gap-2 rounded border p-3 text-sm"><span>{c.ownRef} · {c.title} {c.clientName && `· ${c.clientName}`}</span><span>รายรับ {formatCurrency(c.revenue)} · ค่าใช้จ่าย {formatCurrency(c.expenses)} · <span className={c.profit < 0 ? 'text-destructive' : 'text-success'}>กำไร {formatCurrency(c.profit)}</span></span></Link>) : <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลคดี</p>}</div></details>
    {metrics && <details className="rounded-lg border bg-card"><summary className="disclosure cursor-pointer p-4"><span className="flex items-center gap-3 font-semibold"><Target className="h-9 w-9 rounded border bg-muted p-2" />เป้าชั่วโมง</span><span className="ml-auto text-right text-sm text-muted-foreground">{missingTargets ? `ยังไม่ตั้งเป้า ${missingTargets} คน` : 'ตั้งเป้าครบแล้ว'}</span></summary><div className="space-y-2 border-t p-4">{metrics.members.map((m) => <p key={m.userId} className="text-sm">{m.name} · {m.targetMonthly == null ? 'ยังไม่ตั้งเป้า' : `เป้า ${hours(m.targetMonthly)} ชม./เดือน · ทำได้ ${percent(m.utilization)}`}</p>)}<Link href="/team" className="inline-block text-sm font-medium underline">ตั้งเป้า</Link></div></details>}
  </div>;
}
