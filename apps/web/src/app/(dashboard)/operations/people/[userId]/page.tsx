'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CircleCheck, Clock, FolderOpen, Hourglass, ListFilter, TriangleAlert, type LucideIcon } from 'lucide-react';
import { hasFirmCapability, type CoachingNoteView, type MemberWorkSummary } from '@lawfirm/shared';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/daily-workboard';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Skeleton } from '@/components/ui/misc';
import { CoachingTab } from '@/components/operations/coaching/CoachingTab';
import { avatarColor } from '@/components/operations/team-radar-helpers';

const TOKENS = { green: '--terra-text-176347', amber: '--terra-text-70510b', navy: '--terra-bg-142e43', red: '--terra-text-8b302c', muted: '--muted-foreground', grid: '--border' } as const;
/** SVG chart attributes cannot read CSS variables, so resolve the theme tokens to colors once mounted.
 * ponytail: read on mount only; a live light/dark switch needs a reload to recolor the charts. */
function useChartColors() {
  const [colors, setColors] = useState<Record<keyof typeof TOKENS, string>>({ green: '#176347', amber: '#70510b', navy: '#142e43', red: '#8b302c', muted: '#6b7280', grid: '#e5e7eb' });
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setColors(c => Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, style.getPropertyValue(v).trim() || c[k as keyof typeof TOKENS]])) as typeof c);
  }, []);
  return colors;
}
const weekLabel = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' });
const tooltip = { contentStyle: { borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 } };
const chip = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold';

function LegendChip({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return <span className={`${chip} bg-muted`}><span aria-hidden className={line ? 'h-0.5 w-3' : 'h-2 w-2 rounded-full'} style={{ background: color }} />{label}</span>;
}

function Panel({ title, hint, aside, children }: { title: string; hint: string; aside?: ReactNode; children: ReactNode }) {
  return <section className="min-w-0 rounded-[22px] border border-[var(--terra-border-eee5df)] bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-muted-foreground">{hint}</p></div>{aside && <div className="flex flex-wrap gap-2">{aside}</div>}</div>
    <div className="mt-5">{children}</div>
  </section>;
}

function Kpi({ label, Icon, iconClass, children, hint }: { label: string; Icon: LucideIcon; iconClass: string; children: ReactNode; hint: ReactNode }) {
  return <div className="rounded-[22px] border border-[var(--terra-border-eee5df)] bg-card p-5 shadow-sm">
    <div className="flex items-center justify-between gap-2"><p className="whitespace-nowrap text-sm font-semibold text-muted-foreground">{label}</p><Icon size={18} aria-hidden className={iconClass} /></div>
    <div className="mt-3 min-h-10 text-4xl font-bold">{children}</div>
    <div className="mt-3 text-xs text-muted-foreground">{hint}</div>
  </div>;
}

export default function MemberSummaryPage() {
  const { userId } = useParams<{ userId: string }>();
  const { token, user, loading } = useAuth();
  const allowed = hasFirmCapability(user?.firmRole, 'runOperations');
  const [data, setData] = useState<MemberWorkSummary | null>(null);
  const [notes, setNotes] = useState<CoachingNoteView[]>([]);
  const [error, setError] = useState('');
  const c = useChartColors();
  const axis = { fontSize: 12, fill: c.muted };
  const refreshNotes = useCallback(async () => { if (token) setNotes(await request<CoachingNoteView[]>(`/coaching/members/${encodeURIComponent(userId)}`, { token, silent: true })); }, [token, userId]);
  const load = useCallback(async () => {
    if (!token || !allowed) return;
    setError('');
    try { const [summary] = await Promise.all([request<MemberWorkSummary>(`/operations/people/${encodeURIComponent(userId)}/summary`, { token, silent: true }), refreshNotes()]); setData(summary); }
    catch (e) { setError(e instanceof Error ? e.message : 'โหลดสรุปการทำงานไม่สำเร็จ'); }
  }, [token, allowed, userId, refreshNotes]);
  useEffect(() => { void load(); }, [load]);

  if (!loading && !allowed) return <p>หน้านี้สำหรับผู้ดูแลทีม <Link href="/operations" className="underline">กลับไปภาพรวมงาน</Link></p>;
  const weeks = data?.weeks.map(w => ({ ...w, label: weekLabel(w.weekStart) })) ?? [];
  const sum = (list: typeof weeks, key: 'closed' | 'added') => list.reduce((s, w) => s + w[key], 0);
  const closed4 = sum(weeks.slice(-4), 'closed');
  const delta = closed4 - sum(weeks.slice(-8, -4), 'closed');
  const current = weeks.at(-1);
  const stages = data?.stages ?? [];
  const openTotal = stages.reduce((s, x) => s + x.count, 0);
  const maxCount = Math.max(1, ...stages.map(s => s.count));
  // Bottleneck = the stage holding the most work-days (count × average wait).
  const bottleneck = [...stages].filter(s => s.count).sort((a, b) => b.count * b.avgDays - a.count * a.avgDays)[0];

  return <main className="space-y-6 pb-24">
    <header className="flex flex-wrap items-center gap-4">
      {data && <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-bold ${avatarColor(data.userId)}`}>{data.firstName.slice(0, 1)}</div>}
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground"><Link href="/operations" className="hover:underline">ภาพรวมงาน</Link> / <span className="font-semibold text-foreground">สรุปการทำงาน</span></p>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">{data ? `${data.firstName} ${data.lastName}` : 'สรุปการทำงาน'}</h1>{data && <span className={`${chip} bg-muted`}>{ROLE_LABELS[data.role] ?? 'สมาชิกทีม'}</span>}</div>
        <p className="text-sm text-muted-foreground">ภาพรวม 12 สัปดาห์ล่าสุด และงานที่ค้างอยู่ตอนนี้</p>
      </div>
    </header>
    {error && <LoadFailed message={error} onRetry={() => void load()} />}
    {!data && !error && <div role="status" aria-label="กำลังโหลดสรุปการทำงาน" className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-72 w-full" /></div>}
    {data && <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="ปิดงานได้ (4 สัปดาห์)" Icon={CircleCheck} iconClass="text-[var(--terra-text-176347)]" hint={<span className="flex flex-wrap items-center gap-2">{delta !== 0 && <span className={`${chip} ${delta > 0 ? 'bg-[var(--terra-mint)] text-[var(--terra-green-text)]' : 'bg-[var(--terra-bg-fce9e6)] text-[var(--terra-text-8b302c)]'}`}>{delta > 0 ? '↑' : '↓'} {delta > 0 ? '+' : ''}{delta}</span>}งานใหม่เข้ามา {sum(weeks.slice(-4), 'added')} งาน</span>}><span className="text-[var(--terra-text-176347)]">{closed4}</span></Kpi>
        <Kpi label="งานค้างตอนนี้" Icon={FolderOpen} iconClass="text-muted-foreground" hint="ยังไม่ปิด รวมงานรอตรวจ">{current?.open ?? 0}</Kpi>
        <Kpi label="เลยกำหนด" Icon={TriangleAlert} iconClass="text-[var(--terra-text-8b302c)]" hint={current?.overdue ? <span className={`${chip} bg-[var(--terra-bg-fce9e6)] text-[var(--terra-text-8b302c)]`}>ควรเคลียร์ก่อนรับงานใหม่</span> : 'ไม่มีงานเลยกำหนด'}><span className={current?.overdue ? 'text-[var(--terra-text-8b302c)]' : ''}>{current?.overdue ?? 0}</span></Kpi>
        <Kpi label="คอขวด" Icon={Hourglass} iconClass="text-[var(--terra-text-70510b)]" hint={bottleneck ? `${bottleneck.count} งาน · รอเฉลี่ย ${bottleneck.avgDays} วัน` : 'ไม่มีงานค้าง'}>{bottleneck ? <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--terra-bg-faeccc)] px-4 py-1 text-2xl text-[var(--terra-text-70510b)]"><span aria-hidden className="h-2 w-2 rounded-full bg-current" />{bottleneck.label}</span> : <span className="text-2xl text-muted-foreground">ไม่มี</span>}</Kpi>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel title="งานที่ปิดได้ต่อสัปดาห์" hint="เทียบงานที่ปิดกับงานใหม่ที่เข้ามา" aside={<><LegendChip color={c.green} label="ปิดได้" /><LegendChip color={c.amber} label="งานใหม่" /></>}>
            <div className="h-64"><ResponsiveContainer><BarChart data={weeks} barGap={4}><CartesianGrid vertical={false} stroke={c.grid} /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={28} /><Tooltip {...tooltip} cursor={{ fill: 'var(--muted)' }} /><Bar dataKey="closed" name="ปิดได้" fill={c.green} radius={[4, 4, 0, 0]} maxBarSize={14} /><Bar dataKey="added" name="งานใหม่" fill={c.amber} radius={[4, 4, 0, 0]} maxBarSize={14} /></BarChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="งานค้างและเลยกำหนด" hint="จำนวนงานที่ยังไม่ปิด ณ สิ้นแต่ละสัปดาห์" aside={<><LegendChip color={c.navy} label="งานค้าง" line /><LegendChip color={c.red} label="เลยกำหนด" line /></>}>
            <div className="h-64"><ResponsiveContainer><ComposedChart data={weeks}><defs><linearGradient id="openFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.navy} stopOpacity={0.18} /><stop offset="100%" stopColor={c.navy} stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke={c.grid} /><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} width={28} /><Tooltip {...tooltip} /><Area type="linear" dataKey="open" name="งานค้าง" stroke={c.navy} strokeWidth={2} fill="url(#openFill)" dot={false} activeDot={{ r: 4 }} /><Line type="linear" dataKey="overdue" name="เลยกำหนด" stroke={c.red} strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></ComposedChart></ResponsiveContainer></div>
          </Panel>
          <Panel title="งานติดอยู่ขั้นไหน" hint="ขั้นที่งานเยอะและรอนานคือคอขวด" aside={<span className={`${chip} bg-muted`}><ListFilter size={13} aria-hidden />รวม {openTotal} งานค้าง</span>}>
            <ol className="space-y-2">{stages.map((s, i) => {
              const hot = s.stage === bottleneck?.stage;
              return <li key={s.stage} className={`grid grid-cols-[8rem_1fr_auto] items-center gap-2 sm:gap-3 rounded-xl px-2 py-1.5 text-sm sm:grid-cols-[11rem_1fr_7rem] ${hot ? 'bg-[var(--terra-bg-fff8ee)] ring-1 ring-[var(--terra-bg-faeccc)]' : ''} ${s.count ? '' : 'text-muted-foreground opacity-60'}`}>
                <span className={`flex items-center gap-2 whitespace-nowrap ${hot ? 'font-bold text-[var(--terra-text-70510b)]' : 'font-semibold'}`}>{i + 1}. {s.label}{hot && <span className="rounded bg-[var(--terra-text-70510b)] px-1.5 py-0.5 text-[10px] font-bold text-white">คอขวด</span>}</span>
                <span className="h-7 rounded-lg bg-muted" aria-hidden><span className={`flex h-full min-w-14 items-center rounded-lg px-2 text-xs font-bold ${hot ? 'bg-[var(--terra-bg-faeccc)] text-[var(--terra-text-70510b)]' : 'bg-[var(--terra-border-eee5df)]'}`} style={{ width: `${(s.count / maxCount) * 100}%` }}>{s.count} งาน</span></span>
                <span className={`whitespace-nowrap text-right text-xs ${hot ? 'font-bold text-[var(--terra-text-70510b)]' : 'text-muted-foreground'}`}><span className="sr-only">{s.count} งาน </span><span className="hidden sm:inline">รอเฉลี่ย </span>{s.avgDays} วัน</span>
              </li>;
            })}</ol>
            {data.stuck.length > 0 && <div className="mt-8">
              <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="font-bold">งานที่รอนานที่สุด</h3><p className="text-sm text-muted-foreground">เรียงตามเวลาที่ค้างอยู่ในขั้นปัจจุบัน</p></div><span className="text-xs text-muted-foreground">{data.stuck.length} รายการ</span></div>
              <ul className="mt-3 space-y-2">{data.stuck.map(t => <li key={t.id}><Link href={`/todos?task=${encodeURIComponent(t.id)}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--terra-border-eee5df)] p-4 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2">
                <span className="min-w-0 basis-full sm:basis-0 sm:flex-1"><span className="block truncate font-semibold">{t.title}</span>{t.caseRef && <span className="block text-xs text-muted-foreground">คดี {t.caseRef}</span>}</span>
                <span className="flex shrink-0 gap-2"><span className={`${chip} bg-[var(--terra-bg-faeccc)] text-[var(--terra-text-70510b)]`}>{t.label}</span><span className={`${chip} ${t.overdue ? 'bg-[var(--terra-bg-fce9e6)] text-[var(--terra-text-8b302c)]' : 'bg-muted'}`}>{t.overdue && <Clock size={12} aria-hidden />}{t.days} วัน{t.overdue && ' · เลยกำหนด'}</span></span>
              </Link></li>)}</ul>
            </div>}
          </Panel>
        </div>
        <div className="min-w-0 xl:sticky xl:top-4">
          <Panel title="คำแนะนำการทำงาน" hint="เขียนเอง หรือให้ AI ร่างจากข้อมูลจริงและชี้คอขวด แล้วแก้ก่อนส่ง">
            {token && <CoachingTab token={token} userId={data.userId} name={data.firstName} notes={notes} refresh={refreshNotes} />}
          </Panel>
        </div>
      </div>
    </>}
  </main>;
}
