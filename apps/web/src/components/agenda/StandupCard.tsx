'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCheck, Coffee, Send, SkipForward, Sun, X } from 'lucide-react';
import type { StandupToday, TaskRef } from '@lawfirm/shared';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokTime } from '@/lib/bangkok';
import { standupLabel } from '@/components/operations/team-radar-helpers';
import { greeting, toggleChip } from './standup-helpers';

const field = 'mt-2 w-full rounded-xl border bg-card p-3 text-sm';
const hint = 'mt-1 text-xs text-muted-foreground';
export function StandupCard() {
  const { token, user } = useAuth();
  const [data, setData] = useState<StandupToday | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [yesterday, setYesterday] = useState<string[]>([]);
  const [today, setToday] = useState<string[]>([]);
  const [yesterdayNote, setYesterdayNote] = useState('');
  const [todayNote, setTodayNote] = useState('');
  const [blocker, setBlocker] = useState('');
  const [noBlocker, setNoBlocker] = useState(false);
  useEffect(() => {
    if (!token) return;
    let active = true;
    request<StandupToday>('/standup/today', { token, silent: true }).then(value => {
      if (!active) return;
      setData(value); setEditing(value.state === 'not_yet');
      setYesterday((value.entry?.yesterday ?? value.suggestions.yesterday.slice(0, 20)).map(t => t.id));
      setToday((value.entry?.today ?? value.suggestions.today.slice(0, 20)).map(t => t.id));
      setYesterdayNote(value.entry?.yesterdayNote ?? ''); setTodayNote(value.entry?.todayNote ?? '');
      setBlocker(value.entry?.blocker ?? ''); setNoBlocker(!!value.entry && !value.entry.blocker);
    }).catch(() => { if (active) setError('โหลดเช็กอินไม่สำเร็จ กรุณาลองใหม่'); });
    return () => { active = false; };
  }, [token]);
  const save = async (skip: boolean) => {
    if (!token || !data || pending) return;
    setPending(true); setError('');
    try {
      const entry = await request<NonNullable<StandupToday['entry']>>(skip ? '/standup/today/skip' : '/standup/today', { token, method: skip ? 'POST' : 'PUT', body: skip ? undefined : JSON.stringify({ yesterdayTaskIds: yesterday, todayTaskIds: today, yesterdayNote, todayNote, blocker: noBlocker ? '' : blocker }), silent: true });
      setData({ ...data, entry, state: skip ? 'skipped' : entry.blocker ? 'blocked' : 'checked_in' });
      setYesterday(entry.yesterday.map(t => t.id)); setToday(entry.today.map(t => t.id));
      setYesterdayNote(entry.yesterdayNote ?? ''); setTodayNote(entry.todayNote ?? ''); setBlocker(entry.blocker ?? ''); setNoBlocker(!entry.blocker); setEditing(false);
    } catch { setError(skip ? 'ข้ามเช็กอินไม่สำเร็จ กรุณาลองใหม่' : 'ส่งเช็กอินไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setPending(false); }
  };
  if (!data) return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;
  if (!data.required) return null;
  const tasks = (suggested: TaskRef[], saved: TaskRef[] | undefined) => [...suggested, ...(saved ?? []).filter(t => !suggested.some(s => s.id === t.id))];
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const chip = (task: TaskRef, selected: boolean, onClick: () => void, remove = false) => <span key={task.id}><button type="button" aria-pressed={selected} disabled={pending || (!selected && today.length >= 20)} onClick={onClick} className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold ${selected ? 'border-[var(--terra-mint-border)] bg-[var(--terra-mint)] text-[var(--terra-green-text)]' : 'bg-card text-muted-foreground'}`}>{!remove && selected && <Check size={13} className="shrink-0" />}<span className="truncate">{task.title}</span>{remove && <X size={13} className="shrink-0" />}</button><span className="sr-only">{remove ? 'นำงานออกจากเช็กอิน' : 'เลือกหรือยกเลิกงานวันนี้'}</span></span>;
  return <section className="rounded-[22px] border border-[var(--terra-border)] bg-gradient-to-br from-[var(--terra-warm)] to-[var(--terra-mint)] p-5 shadow-lg sm:p-7">
    {!editing ? <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><CheckCheck className="h-12 w-12 rounded-full bg-[var(--terra-mint)] p-3 text-[var(--terra-green-text)]" /><div><b>{standupLabel(data.state)}{data.entry && ` ${bangkokTime(data.entry.updatedAt)}`} · ดูหรือแก้ได้</b><p className="text-sm text-muted-foreground">{data.state === 'skipped' ? 'ทีมเห็นว่าคุณข้ามวันนี้' : 'ขอบคุณที่เล่าให้ทีมฟัง วันนี้ไปด้วยกันนะ'}</p></div></div><div><button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-full border bg-card px-4 font-bold">ดูหรือแก้เช็กอิน</button><p className={hint}>เปิดเช็กอินของวันนี้</p></div></div> : <>
      <div className="mb-5 flex items-center gap-4"><div aria-hidden className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--terra-peach)] text-[var(--terra-rose-text)]"><Sun size={22} /><Coffee size={20} className="absolute -bottom-1 -left-1 rounded-full bg-[var(--terra-mint)] p-1 text-[var(--terra-green-text)]" /></div><div><p className="text-sm font-bold">เช็กอินวันนี้ · {new Date(`${data.day.slice(0, 10)}T00:00:00+07:00`).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' })}</p><h2 className="text-2xl font-semibold">{greeting(hour)} คุณ{user?.firstName}</h2><p className="text-sm">เริ่มวันด้วยการเล่าให้ทีมรู้ว่าวันนี้เป็นอย่างไร</p></div></div>
      <div className="grid gap-4 md:grid-cols-2"><div className="rounded-[20px] border border-[var(--terra-border)] bg-card p-4"><b>1. เมื่อวานทำอะไรไปบ้าง</b><p className={hint}>จากงานที่อัปเดตหรือทำเสร็จเมื่อวาน · แตะเพื่อนำออก</p><div className="mt-3 flex flex-wrap gap-2">{tasks(data.suggestions.yesterday, data.entry?.yesterday).filter(t => yesterday.includes(t.id)).map(t => chip(t, true, () => setYesterday(toggleChip(yesterday, t.id)), true))}</div><p className={hint}>แตะชิปเพื่อนำงานออกจากเช็กอิน</p><label htmlFor="standup-yesterday" className="mt-4 block font-bold">บันทึกเพิ่มเติม</label><textarea id="standup-yesterday" className={field} rows={2} maxLength={2000} value={yesterdayNote} disabled={pending} onChange={e => setYesterdayNote(e.target.value)} placeholder="เล่าเพิ่มเติมได้ที่นี่" /></div>
      <div className="rounded-[20px] border border-[var(--terra-border)] bg-card p-4"><b>2. วันนี้จะทำอะไร</b><p className={hint}>งานที่ถึงกำหนดหรือวางแผนไว้วันนี้ · แตะเพื่อเลือก</p><div className="mt-3 flex flex-wrap gap-2">{tasks(data.suggestions.today, data.entry?.today).map(t => chip(t, today.includes(t.id), () => setToday(toggleChip(today, t.id))))}</div><p className={hint}>แตะชิปเพื่อเลือกงานที่จะทำวันนี้ (สูงสุด 20 งาน)</p><label htmlFor="standup-today" className="mt-4 block font-bold">เพิ่มงานอื่น</label><textarea id="standup-today" className={field} rows={2} maxLength={2000} value={todayNote} disabled={pending} onChange={e => setTodayNote(e.target.value)} placeholder="มีงานอื่นที่วางแผนไว้ไหม" /></div>
      <div className="rounded-[20px] border border-[var(--terra-border)] bg-card p-4 md:col-span-2"><b>3. ติดอะไรอยู่ไหม</b><p className={hint}>บอกทีมได้ถ้าต้องการความช่วยเหลือ (ไม่บังคับ)</p><label htmlFor="standup-blocker" className="mt-4 block font-bold">สิ่งที่ติดอยู่</label><textarea id="standup-blocker" className={field} rows={2} maxLength={2000} value={blocker} disabled={pending || noBlocker} onChange={e => setBlocker(e.target.value)} placeholder="เช่น รอเอกสารจากลูกค้า" /><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={noBlocker} disabled={pending} onChange={e => { setNoBlocker(e.target.checked); if (e.target.checked) setBlocker(''); }} />ไม่มี ทุกอย่างโอเค</label></div></div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-4 flex flex-wrap gap-4"><div><button type="button" disabled={pending} onClick={() => void save(false)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50"><Send size={16} />ส่งเช็กอิน</button><p className={hint}>ส่งให้ผู้ดูแลทีมเห็น</p></div><div><button type="button" disabled={pending} onClick={() => void save(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-5 font-bold disabled:opacity-50"><SkipForward size={16} />ข้ามวันนี้</button><p className={hint}>ข้ามเช็กอินสำหรับวันนี้</p></div></div>
    </>}
  </section>;
}
