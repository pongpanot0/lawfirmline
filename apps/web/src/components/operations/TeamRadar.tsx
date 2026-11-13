'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Flame, Gauge, Gavel, Hourglass, Palmtree, Sprout, Sun, UserPlus, Users, MessagesSquare } from 'lucide-react';
import { compareWorkload, dayLoad, daysLate, workloadStatus, ownerDecisionTasks, type DailyWorkboard, type TeamRadar as Radar, type TeamRadarDay, type TeamRadarMember } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { ROLE_LABELS } from '@/lib/daily-workboard';
import { Button } from '@/components/ui/button';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { suggestMember, avatarColor, standupLabel } from './team-radar-helpers';
import Link from 'next/link';
import { PersonWorkloadDrawer } from './PersonWorkloadDrawer';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
const shortDayLabel = (day: string) => { const date = new Date(`${day}T00:00:00Z`); return `${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'][date.getUTCDay()]} ${date.getUTCDate()}`; };
const weekend = (day: string) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
const role = (value: string) => value === 'OWNER' ? 'เจ้าของสำนักงาน' : ROLE_LABELS[value] ?? 'สมาชิกทีม';

function Status({ member }: { member: TeamRadarMember }) {
  const kind = workloadStatus(member);
  const status = kind === 'over_standard' ? { text: 'งานเยอะไปหน่อยนะ', Icon: Flame, tone: 'bg-[#fce9e6] text-[#8b302c]' } : kind === 'has_overdue' ? { text: 'มีงานรอเคลียร์', Icon: Hourglass, tone: 'bg-[#fff0df] text-[#80500c]' } : kind === 'near_standard' ? { text: 'ใกล้เต็มคิวแล้ว', Icon: Gauge, tone: 'bg-[#f9f0d3] text-[#70510b]' } : kind === 'on_leave_this_week' ? { text: 'ไปพักผ่อนอยู่', Icon: Palmtree, tone: 'bg-[#e7edf6] text-[#35577c]' } : { text: 'ว่าง พร้อมช่วยเพื่อน', Icon: Sun, tone: 'bg-[#e1f2e9] text-[#176347]' };
  return <div><span className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold ${status.tone}`}><status.Icon size={14} aria-hidden />{status.text}</span>{member.overdueCount > 0 && <p className="mt-1 text-xs text-[#a33b37]">เลยกำหนด {member.overdueCount} งาน</p>}</div>;
}
function Member({ member }: { member: TeamRadarMember }) {
  const kind = workloadStatus(member);
  const Mood = kind === 'over_standard' ? Flame : kind === 'has_overdue' ? Hourglass : kind === 'near_standard' ? Gauge : kind === 'on_leave_this_week' ? Palmtree : Sun;
  const cue = standupLabel(member.standup);
  const recent = member.coaching?.lastSentAt && Date.now() - new Date(member.coaching.lastSentAt).getTime() <= 7 * 86400000 && Date.now() >= new Date(member.coaching.lastSentAt).getTime();
  return <div className="flex items-start gap-3"><div className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full font-bold ${avatarColor(member.userId)}`}>{member.firstName.slice(0, 1)}<span className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-[#fff8ee] p-1 text-[#70510b]"><Mood size={11} /></span></div><div className="min-w-0"><strong>{member.firstName} {member.lastName}</strong><p className="text-xs text-muted-foreground">{role(member.role)}</p>{cue && <p className={`mt-1 flex items-center gap-1 whitespace-nowrap text-xs ${member.standup === 'blocked' ? 'text-[#a33b37]' : 'text-[#306e5c]'}`}><ClipboardCheck size={13} />{cue}</p>}{(member.coaching?.unacknowledged > 0 || recent) && <p className="mt-1 flex items-center gap-1 text-xs text-[#306e5c]"><Sprout size={13} />{member.coaching?.unacknowledged > 0 ? 'มีคำแนะนำใหม่' : 'เพิ่งได้รับคำแนะนำ'}</p>}</div></div>;
}
function DayCell({ day, onClick }: { day: TeamRadarDay; onClick: () => void }) {
  const load = dayLoad(day.points);
  const clash = day.onLeave && day.points > 0;
  const tone = clash || load === 'over' ? 'bg-[#f9ded9] text-[#8b302c]' : day.onLeave ? 'bg-[#dcedf7] text-[#35577c]' : load === 'busy' ? 'bg-[#faeccc] text-[#70510b]' : 'bg-[#d8eee1] text-[#285d4e]';
  const label = day.onLeave ? `ลา${clash ? ` แต่มีงาน ${day.points} แต้ม` : ''}` : `${day.points} แต้ม${day.courtCount ? ` นัดศาล ${day.courtCount}` : ''}`;
  return <button type="button" title={`เปิดคิว ${dayLabel(day.date)}`} aria-label={`${dayLabel(day.date)} ${label}${day.outlookBusyMinutes ? ` · ไม่ว่างใน Outlook ${Math.round(day.outlookBusyMinutes / 6) / 10} ชม.` : ''}`} onClick={onClick} className={`mx-auto flex h-10 w-full max-w-10 items-center justify-center gap-0.5 rounded-full text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${weekend(day.date) ? 'border-2 border-dashed border-[#a4bdb5]' : ''} ${tone}`}>{day.onLeave ? <><Palmtree size={15} />{clash && day.points}</> : <>{day.points}{day.courtCount > 0 && <Gavel size={11} />}</>}</button>;
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
  const members = [...(radar?.members ?? [])].sort(compareWorkload);
  const items = board ? ownerDecisionTasks(board.tasks, today) : [];
  const unassigned = board?.tasks.filter((t) => !t.assigneeId && t.status !== 'DONE').length ?? 0;
  // Today's leave must come from today's workboard, even when a different week is selected.
  const suggestion = board && radar ? suggestMember(radar.members, board.members) : undefined;
  const open = (id: string, day: string | null = null) => setPerson({ id, day });
  const table = <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap justify-between gap-2"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Users size={20} /> Team Radar <span className="rounded-full bg-[#e1f2e9] px-2 py-1 text-xs text-[#176347]">{members.length} คน</span></h2><p className="text-sm text-muted-foreground">ดูคิวงานและเวลาของแต่ละคนในสัปดาห์นี้</p></div><p className="text-xs text-muted-foreground">เรียงคนที่ควรดูแลก่อน</p></div>
    {error && <LoadFailed message={error} onRetry={() => void load()} />}
    {loading && !radar && <div role="status" aria-label="กำลังโหลดภาพรวมทีม"><Skeleton className="h-40 w-full" /></div>}
    {radar && !members.length && <InlineEmptyState title="ยังไม่มีคนในทีม" />}
    {radar && members.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f2ded1] bg-gradient-to-r from-[#fff0e8] to-[#eff6e9] p-5"><div><h3 className="font-bold">วันนี้ทีมเราเป็นไงบ้าง</h3><p className="text-sm">สัปดาห์นี้มี {members.filter(m => workloadStatus(m) === 'over_standard').length} คนงานเยอะ ลองแบ่งให้เพื่อนที่ว่างดูไหม</p></div><div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-white px-3 py-2 text-[#8b302c]">งานเยอะ {members.filter(m => workloadStatus(m) === 'over_standard').length}</span><span className="rounded-full bg-white px-3 py-2 text-[#176347]">ว่าง {members.filter(m => workloadStatus(m) === 'free').length}</span><span className="rounded-full bg-white px-3 py-2 text-[#35577c]">ลา {members.filter(m => m.days.some(d => d.onLeave)).length}</span></div></div>
      <div className="hidden md:block"><table className="w-full table-fixed border-separate border-spacing-y-2 text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="w-[21%]">สมาชิก</th><th className="w-[18%]">สถานะ</th><th className="w-[10%]">คิว / เกณฑ์ส่วนตัว</th>{radar.days.map(d => <th key={d} className="text-center">{shortDayLabel(d)}</th>)}<th className="w-20">รายละเอียด</th></tr></thead><tbody>{members.map(m => <tr key={m.userId} className="bg-gradient-to-r from-[#faf0ed] to-white"><td className="rounded-l-2xl border-y border-l border-[#eee5df] p-2"><Member member={m} /></td><td className="border-y border-[#eee5df] p-2"><Status member={m} /></td><td className="border-y border-[#eee5df] p-1 font-semibold">{m.openPoints} / {m.standardPoints} แต้ม</td>{m.days.map(d => <td key={d.date} className="border-y border-[#eee5df] p-1"><DayCell day={d} onClick={() => open(m.userId, d.date)} /></td>)}<td className="rounded-r-2xl border-y border-r border-[#eee5df] p-1"><button onClick={() => open(m.userId)} className="min-h-11 font-bold underline focus-visible:outline focus-visible:outline-2">เปิดดู</button><p className="text-xs text-muted-foreground">ดูงานและคำแนะนำ</p></td></tr>)}</tbody></table></div>
      <div className="space-y-3 md:hidden">{members.map(m => <article key={m.userId} className="rounded-2xl border border-[#eee5df] bg-gradient-to-r from-[#faf0ed] to-white p-4 shadow-sm"><Member member={m} /><p className="ml-14 text-xs text-muted-foreground">คิว {m.openPoints} / {m.standardPoints} แต้ม</p><div className="ml-14 mt-2"><Status member={m} /></div><div className="mt-4 grid grid-cols-7 gap-1">{m.days.map(d => <div key={d.date} className="min-w-0 text-center"><span className="block text-[10px] text-muted-foreground">{shortDayLabel(d.date)}</span><DayCell day={d} onClick={() => open(m.userId, d.date)} /></div>)}</div><div className="mt-3 text-right"><button onClick={() => open(m.userId)} className="min-h-11 font-bold focus-visible:outline focus-visible:outline-2">เปิดดูคำแนะนำ →</button><p className="text-xs text-muted-foreground">ดูงานและคำแนะนำ</p></div></article>)}</div>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><p>ตัวเลขในแต่ละวันคือแต้มงานที่วางไว้ · รูปต้นปาล์มหมายถึงวันลา</p>{canManage && <div><Link href="/coaching" className="font-bold text-[#36566b]">เปิดดูคำแนะนำทีม →</Link><p>ดูประวัติและสถานะการรับทราบ</p></div>}</div>
    </>}
  </section>;
  return <div className="space-y-5 pb-24"><div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{d.nav.operations}</h1><p className="text-sm text-muted-foreground">ใครงานล้น ใครว่าง และงานไหนต้องตามวันนี้ {radar && `· ${dayLabel(radar.days[0])} – ${dayLabel(radar.days[radar.days.length - 1])}`}</p></div><div><div className="flex items-center rounded-lg border bg-card shadow-sm"><Button variant="ghost" size="icon" title="ดูสัปดาห์ก่อน" aria-label="สัปดาห์ก่อน" disabled={loading} onClick={() => setStart((s) => shiftDay(s, -7))}><ChevronLeft className="h-4 w-4" aria-hidden /></Button><Button variant="ghost" title="กลับไปสัปดาห์นี้" onClick={() => setStart(today)}>สัปดาห์นี้</Button><Button variant="ghost" size="icon" title="ดูสัปดาห์ถัดไป" aria-label="สัปดาห์ถัดไป" disabled={loading} onClick={() => setStart((s) => shiftDay(s, 7))}><ChevronRight className="h-4 w-4" aria-hidden /></Button></div><p className="mt-1 text-right text-xs text-muted-foreground">กดเพื่อดูสัปดาห์อื่น</p></div></div>
    {canManage && <div className="text-right"><Link href="/coaching" className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-4 font-bold shadow-sm focus-visible:outline focus-visible:outline-2"><MessagesSquare size={16} />คำแนะนำทีม</Link><p className="mt-1 text-xs text-muted-foreground">ดูประวัติคำแนะนำที่ส่งแล้ว</p></div>}
    {canManage && <section className="rounded-xl border border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 shadow-sm sm:p-7"><span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"><ClipboardList className="mr-1 inline h-3.5 w-3.5" aria-hidden />ต้องจัดการวันนี้</span>{boardError ? <LoadFailed message={boardError} onRetry={() => void loadBoard()} /> : !board ? <Skeleton className="mt-4 h-24 w-full" /> : <><h2 className="mt-2 text-xl font-semibold">วันนี้ต้องตาม {items.length} งาน{unassigned > 0 && ` · ยังไม่มีคนรับ ${unassigned} งาน`}</h2><div className="mt-4 grid gap-5 md:grid-cols-[2fr_1fr]"><div className="order-2 md:order-1"><div className="divide-y rounded-lg border bg-card">{items.slice(0, 3).map(({ task, reason }, index) => <div key={task.id} className="flex flex-wrap items-center gap-2 px-3 py-3 text-sm"><span className="rounded-full bg-amber-100 px-2 text-amber-800">{index + 1}</span><span className="min-w-0 flex-1 break-words font-medium">{task.title} {task.case && <span className="font-normal text-muted-foreground">· {task.case.ownRef}</span>}</span>{!task.assigneeId ? <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"><UserPlus className="h-3.5 w-3.5" aria-hidden />ยังไม่มีคนรับ</span> : daysLate(task, today) !== null && daysLate(task, today)! > 0 ? <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"><AlertCircle className="h-3.5 w-3.5" aria-hidden />เกินกำหนด {daysLate(task, today)} วัน</span> : <span className="rounded border border-amber-200 px-2 py-1 text-xs text-amber-800">{reason}</span>}</div>)}{!items.length && <p className="p-3 text-sm">ไม่มีงานที่ต้องตามวันนี้</p>}</div><button type="button" title="เปิดรายการงานที่ต้องตามวันนี้" onClick={onShowDaily} className="mt-2 min-h-11 text-sm font-medium">ดูทั้ง {items.length} งาน →</button><p className="text-xs text-muted-foreground">เปิดรายการงานที่ต้องตามวันนี้</p></div><div className="order-1 rounded-2xl border border-[#d3e6d9] bg-[#e8f4eb] p-4 md:order-2"><p className="flex gap-2 font-semibold">{suggestion ? `แนะนำให้ ${suggestion.firstName} ${suggestion.lastName}` : 'ตอนนี้ทุกคนงานแน่นหมด'}</p>{suggestion && <><p className="mt-1 text-sm text-muted-foreground">{suggestion.openPoints} จาก {suggestion.standardPoints} แต้ม · ไม่มีงานเกินกำหนด</p><p className="mt-3 text-sm">มีแต้มงานค้างน้อยที่สุดในกลุ่มที่แนะนำได้ และไม่มีงานเกินกำหนด</p></>}<Button className="mt-4 w-full" title="เปิดคิวงานเพื่อมอบหมายหรือย้ายงาน" disabled={!suggestion} onClick={() => suggestion && open(suggestion.userId)}>มอบหมาย / ย้ายงาน</Button><p className="mt-2 text-center text-xs text-muted-foreground">กดเพื่อเปิดคิวงานและเลือกงาน</p></div></div></>}</section>}
    {children ? children({ team: radar?.members.length ?? null, today: board ? items.length : null }, table) : table}
    <PersonWorkloadDrawer userId={person?.id ?? null} focusDay={person?.day} from={radar?.start} onClose={() => setPerson(null)} onChanged={() => { void load(); void loadBoard(); }} />
  </div>;
}
