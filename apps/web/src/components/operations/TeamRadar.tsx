'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CalendarX, CheckCircle2, ChevronLeft, ChevronRight, Clock, Gavel, Info, Lightbulb, Target, UserPlus } from 'lucide-react';
import { HEAVY_DAY_POINTS, HEAVY_QUEUE_POINTS, daysLate, ownerDecisionTasks, type DailyWorkboard, type TeamRadar as Radar, type TeamRadarDay, type TeamRadarMember } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { ROLE_LABELS } from '@/lib/daily-workboard';
import { Button } from '@/components/ui/button';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { suggestMember } from './team-radar-helpers';
import { PersonWorkloadDrawer } from './PersonWorkloadDrawer';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
const shortDayLabel = (day: string) => { const date = new Date(`${day}T00:00:00Z`); return `${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][date.getUTCDay()]} ${date.getUTCDate()}`; };
const weekend = (day: string) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
const role = (value: string) => value === 'OWNER' ? 'เจ้าของสำนักงาน' : ROLE_LABELS[value] ?? 'สมาชิกทีม';

function Status({ member }: { member: TeamRadarMember }) {
  const leave = member.days.find((d) => d.onLeave);
  const status = member.openPoints > HEAVY_QUEUE_POINTS
    ? { text: `เกินเกณฑ์ ${member.openPoints - HEAVY_QUEUE_POINTS} แต้ม`, Icon: AlertTriangle, tone: 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200' }
    : member.openPoints >= HEAVY_QUEUE_POINTS * .8
      ? { text: 'ใกล้เกณฑ์', Icon: Clock, tone: 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' }
      : leave ? { text: `ลา ${dayLabel(leave.date)}`, Icon: CalendarX, tone: 'border-border bg-muted text-muted-foreground' }
        : { text: 'ว่าง · รับงานได้', Icon: CheckCircle2, tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' };
  return <div className="mt-2 flex flex-wrap gap-1"><span className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${status.tone}`}><status.Icon className="h-3.5 w-3.5" aria-hidden />{status.text}</span>{member.overdueCount > 0 && <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-950 dark:text-red-200"><AlertCircle className="h-3.5 w-3.5" aria-hidden />เกินกำหนด {member.overdueCount} งาน</span>}</div>;
}
function Points({ member, mobile = false }: { member: TeamRadarMember; mobile?: boolean }) {
  const percent = Math.round(member.openPoints / HEAVY_QUEUE_POINTS * 100);
  const color = percent > 100 ? 'bg-red-700' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-600';
  return <div className="min-w-0"><div className="flex justify-between gap-2 text-sm font-semibold"><span className={mobile ? "sr-only" : ""}>{member.openPoints} / {HEAVY_QUEUE_POINTS} แต้ม</span><span>{percent}%</span></div><div className="relative mt-2 h-3 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(percent, 100)}%` }} /><span className="absolute right-0 top-0 h-full w-0.5 bg-primary" /></div></div>;
}
function DayCell({ day, onClick }: { day: TeamRadarDay; onClick: () => void }) {
  if (!day.points && !day.onLeave && !day.courtCount && !day.outlookBusyMinutes) return <div className="min-h-11" />;
  return <button type="button" title={`เปิดคิว ${dayLabel(day.date)}`} aria-label={`${dayLabel(day.date)} · ไม่ว่างใน Outlook ${(day.outlookBusyMinutes || 0) / 60} ชม. ${day.onLeave ? 'ลา' : `${day.points} แต้ม${day.courtCount ? ` นัดศาล ${day.courtCount}` : ''}${day.points > HEAVY_DAY_POINTS ? ' ภาระงานเกินเกณฑ์' : ''}`}`} onClick={onClick} className={`relative flex min-h-11 w-full items-center justify-center gap-0.5 rounded-md border text-sm font-semibold ${!day.points && !day.onLeave ? 'border-transparent' : day.onLeave ? 'bg-muted text-muted-foreground' : day.points > HEAVY_DAY_POINTS ? 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950' : day.points > HEAVY_DAY_POINTS / 2 ? 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950' : 'bg-muted/40'}`}>{day.onLeave ? <><CalendarX className="h-4 w-4" aria-hidden /><span className="sr-only">ลา</span></> : <>{day.points || null}{day.courtCount > 0 && <Gavel className="h-3 w-3" aria-hidden />}{day.points > HEAVY_DAY_POINTS && <Target className="h-3 w-3 text-red-700" aria-hidden />}</>}<span aria-hidden className="absolute bottom-1 left-1 right-1 h-1 rounded bg-muted"><span className="block h-full rounded bg-muted-foreground" style={{ width: `${Math.min(100, (day.outlookBusyMinutes || 0) / 840 * 100)}%` }} /></span></button>;
}

export function TeamRadar({ canManage = false, onShowDaily, children }: { canManage?: boolean; onShowDaily?: () => void; children?: (counts: { team: number | null; today: number | null }, table: ReactNode) => ReactNode }) {
  const d = useDashboardT();
  const { token } = useAuth();
  const today = bangkokDateInputValue(new Date());
  const [start, setStart] = useState(today);
  const [radar, setRadar] = useState<Radar | null>(null);
  const [board, setBoard] = useState<DailyWorkboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [boardError, setBoardError] = useState('');
  const [person, setPerson] = useState<{ id: string; day: string | null } | null>(null);
  const version = useRef(0);
  const load = useCallback(async () => {
    if (!token) return;
    const request = ++version.current; setLoading(true); setError('');
    try { const data = await api.getTeamRadar(token, start); if (request === version.current) setRadar(data); }
    catch (err) { if (request === version.current) { setRadar(null); setError(err instanceof Error ? err.message : 'โหลดข้อมูลทีมไม่สำเร็จ ลองโหลดหน้าใหม่'); } }
    finally { if (request === version.current) setLoading(false); }
  }, [token, start]);
  const loadBoard = useCallback(async () => {
    if (!token || !canManage) return;
    setBoardError('');
    try { setBoard(await api.getDailyWorkboard(token, today)); } catch { setBoard(null); setBoardError('โหลดงานวันนี้ไม่สำเร็จ ลองโหลดหน้าใหม่'); }
  }, [token, today, canManage]);
  useEffect(() => { void load(); return () => { version.current++; }; }, [load]);
  useEffect(() => { void loadBoard(); }, [loadBoard]);
  const members = [...(radar?.members ?? [])].sort((a, b) => b.openPoints - a.openPoints);
  const items = board ? ownerDecisionTasks(board.tasks, today) : [];
  const unassigned = board?.tasks.filter((t) => !t.assigneeId && t.status !== 'DONE').length ?? 0;
  // Today's leave must come from today's workboard, even when a different week is selected.
  const suggestion = board && radar ? suggestMember(radar.members, board.members) : undefined;
  const open = (id: string, day: string | null = null) => setPerson({ id, day });
  const table = <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">สัปดาห์นี้ของแต่ละคน <span className="text-sm font-normal text-muted-foreground">· เกณฑ์มาตรฐาน {HEAVY_QUEUE_POINTS} แต้ม</span></h2><span className="text-xs text-muted-foreground">เรียงจากแต้มมากไปน้อย</span></div>
    {error && <LoadFailed message={error} onRetry={() => void load()} />}
    {loading && !radar && <div role="status" aria-label="กำลังโหลดภาพรวมทีม"><Skeleton className="h-40 w-full" /></div>}
    {radar && !members.length && <InlineEmptyState title="ยังไม่มีคนในทีม" />}
    {radar && members.length > 0 && <>
      <div className="hidden lg:block"><table className="w-full table-fixed text-sm"><thead><tr className="border-y text-left text-xs text-muted-foreground"><th className="w-[22%] py-3">คนในทีม</th><th className="w-[27%]">แต้มงานค้าง</th>{radar.days.map((d) => <th key={d} className={`text-center ${weekend(d) ? 'bg-muted/50' : ''}`}>{dayLabel(d)}</th>)}<th className="w-28 text-right">จัดการ</th></tr></thead><tbody>{members.map((m) => <tr key={m.userId} tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(m.userId); } }} className="border-b last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"><th scope="row" className="py-4 text-left align-top font-normal"><button type="button" title="กดเพื่อเปิดคิวงาน" onClick={() => open(m.userId)} className="text-left font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{m.firstName} {m.lastName}</button><p className="text-xs text-muted-foreground">{role(m.role)}</p><Status member={m} /></th><td className="px-2"><Points member={m} /></td>{m.days.map((d) => <td key={d.date} className={`p-1 ${weekend(d.date) ? 'bg-muted/40' : ''}`}><DayCell day={d} onClick={() => open(m.userId, d.date)} /></td>)}<td className="text-right"><button type="button" title="กดเพื่อเปิดคิวงาน" onClick={() => open(m.userId)} className="min-h-11 whitespace-nowrap text-right font-semibold">ดูคิว ›<span className="block text-xs font-normal text-muted-foreground">กดเพื่อเปิดคิวงาน</span></button></td></tr>)}</tbody></table></div>
      <div className="space-y-3 lg:hidden">{members.map((m) => <article key={m.userId} tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(m.userId); } }} className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold"><button type="button" title="กดเพื่อเปิดคิวงาน" onClick={() => open(m.userId)} className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{m.firstName} {m.lastName}</button></h3><p className="text-xs text-muted-foreground">{role(m.role)}</p></div><span className="text-sm font-semibold">{m.openPoints} / {HEAVY_QUEUE_POINTS} แต้ม</span></div><div className="mt-4"><Points member={m} mobile /></div><Status member={m} /><div className="mt-4 grid grid-cols-7 gap-1">{m.days.map((d) => <div key={d.date} className="min-w-0 text-center"><span className="block whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">{shortDayLabel(d.date)}</span><DayCell day={d} onClick={() => open(m.userId, d.date)} /></div>)}</div><div className="mt-3 border-t pt-2"><button type="button" title="กดเพื่อเปิดคิวงาน" onClick={() => open(m.userId)} className="min-h-11 w-full text-right font-semibold">ดูคิว ›</button></div></article>)}</div>
      <p className="flex flex-wrap gap-4 border-t pt-4 text-xs text-muted-foreground"><span><Gavel className="mr-1 inline h-4 w-4" aria-hidden />มีนัดศาล</span><span><Target className="mr-1 inline h-4 w-4" aria-hidden />ภาระงานเกินเกณฑ์</span><span><CalendarX className="mr-1 inline h-4 w-4" aria-hidden />ลา</span><span>แถบเทา = ไม่ว่างใน Outlook (เห็นแค่ช่วงเวลา)</span></p>
    </>}
  </section>;
  return <div className="space-y-5 pb-24"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{d.nav.operations}</h1><p className="text-sm text-muted-foreground">ใครงานล้น ใครว่าง และงานไหนต้องตามวันนี้ {radar && `· ${dayLabel(radar.days[0])} – ${dayLabel(radar.days[radar.days.length - 1])}`}</p></div><div><div className="flex items-center rounded-lg border bg-card shadow-sm"><Button variant="ghost" size="icon" title="ดูสัปดาห์ก่อน" aria-label="สัปดาห์ก่อน" disabled={loading} onClick={() => setStart((s) => shiftDay(s, -7))}><ChevronLeft className="h-4 w-4" aria-hidden /></Button><Button variant="ghost" title="กลับไปสัปดาห์นี้" onClick={() => setStart(today)}>สัปดาห์นี้</Button><Button variant="ghost" size="icon" title="ดูสัปดาห์ถัดไป" aria-label="สัปดาห์ถัดไป" disabled={loading} onClick={() => setStart((s) => shiftDay(s, 7))}><ChevronRight className="h-4 w-4" aria-hidden /></Button></div><p className="mt-1 text-right text-xs text-muted-foreground">กดเพื่อดูสัปดาห์อื่น</p></div></div>
    <p className="flex gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"><Info className="h-4 w-4 shrink-0" aria-hidden />วัดภาระงานด้วยแต้มงานค้าง: งานเล็ก 1 · กลาง 2 · ใหญ่ 4 แต้ม · เกณฑ์ {HEAVY_QUEUE_POINTS} แต้มต่อคน</p>
    {canManage && <section className="rounded-xl border border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 shadow-sm sm:p-7"><span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">● ต้องจัดการวันนี้</span>{boardError ? <LoadFailed message={boardError} onRetry={() => void loadBoard()} /> : !board ? <Skeleton className="mt-4 h-24 w-full" /> : <><h2 className="mt-2 text-xl font-semibold">วันนี้ต้องตาม {items.length} งาน{unassigned > 0 && ` · ยังไม่มีคนรับ ${unassigned} งาน`}</h2><div className="mt-4 grid gap-5 lg:grid-cols-[2fr_1fr]"><div><div className="divide-y rounded-lg border bg-card">{items.slice(0, 3).map(({ task, reason }, index) => <div key={task.id} className="flex flex-wrap items-center gap-2 px-3 py-3 text-sm"><span className="rounded-full bg-amber-100 px-2 text-amber-800">{index + 1}</span><span className="min-w-0 flex-1 break-words font-medium">{task.title} {task.case && <span className="font-normal text-muted-foreground">· {task.case.ownRef}</span>}</span>{!task.assigneeId ? <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"><UserPlus className="h-3.5 w-3.5" aria-hidden />ยังไม่มีคนรับ</span> : daysLate(task, today) !== null && daysLate(task, today)! > 0 ? <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"><AlertCircle className="h-3.5 w-3.5" aria-hidden />เกินกำหนด {daysLate(task, today)} วัน</span> : <span className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-800">{reason}</span>}</div>)}{!items.length && <p className="p-3 text-sm">ไม่มีงานที่ต้องตามวันนี้</p>}</div><button type="button" title="เปิดรายการงานที่ต้องตามวันนี้" onClick={onShowDaily} className="mt-2 min-h-11 text-sm font-medium">ดูทั้ง {items.length} งาน →</button></div><div className="rounded-lg border border-amber-200 p-4"><p className="flex gap-2 font-semibold"><Lightbulb className="h-5 w-5 text-amber-600" aria-hidden />{suggestion ? `แนะนำให้ ${suggestion.firstName} ${suggestion.lastName}` : 'ไม่มีผู้ที่เข้าเกณฑ์แนะนำ'}</p>{suggestion && <p className="mt-1 text-sm text-muted-foreground">{suggestion.openPoints} จาก {HEAVY_QUEUE_POINTS} แต้ม · ไม่มีงานเกินกำหนด</p>}<Button className="mt-4 w-full" title="เปิดคิวงานเพื่อมอบหมายหรือย้ายงาน" disabled={!suggestion} onClick={() => suggestion && open(suggestion.userId)}>มอบหมาย / ย้ายงาน</Button><p className="mt-2 text-center text-xs text-muted-foreground">กดเพื่อเปิดคิวงานและเลือกงาน</p></div></div></>}</section>}
    {children ? children({ team: radar?.members.length ?? null, today: board ? items.length : null }, table) : table}
    <PersonWorkloadDrawer userId={person?.id ?? null} focusDay={person?.day} from={radar?.start} onClose={() => setPerson(null)} onChanged={() => { void load(); void loadBoard(); }} />
  </div>;
}
