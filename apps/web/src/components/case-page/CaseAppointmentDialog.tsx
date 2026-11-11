'use client';
import { ThaiDateField } from '@/components/ui/ThaiDateField';

import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Check, Scale, UserPlus, Users, X } from 'lucide-react';
import { COURT_EVENT_KIND_LABELS, CourtEventKind } from '@lawfirm/shared';
import { api, ApiError, type UserItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue, bangkokInputToIso } from '@/lib/bangkok';
import v2 from './v2.module.css';

type Kind = 'COURT_DATE' | 'CLIENT_MEETING' | 'DEADLINE';
const KINDS: { value: Kind; label: string; icon: typeof Scale }[] = [
  { value: 'COURT_DATE', label: 'นัดศาล', icon: Scale },
  { value: 'CLIENT_MEETING', label: 'นัดลูกความ', icon: Users },
  { value: 'DEADLINE', label: 'กำหนดส่ง', icon: AlarmClock },
];
const REMINDERS: { minutes: number; label: string }[] = [
  { minutes: 10080, label: '7 วัน' },
  { minutes: 1440, label: '1 วัน' },
  { minutes: 60, label: 'เช้าวันนัด' },
];
const initials = (u: UserItem) => `${u.firstName.slice(0, 1)}${(u.lastName ?? '').slice(0, 1)}`;

/**
 * The single-page "เพิ่มนัด" dialog from scene act-add-appt: what, when, who goes
 * (several people, not necessarily me), an optional prep task and team reminders.
 */
export function CaseAppointmentDialog({ caseId, caseCourtName, caseOwnerId, users, onClose, onSaved, onMoreOptions }: {
  caseId: string;
  caseCourtName?: string | null;
  caseOwnerId?: string | null;
  users: UserItem[];
  onClose: () => void;
  onSaved: () => void;
  onMoreOptions: () => void;
}) {
  const { token, user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<Kind>('COURT_DATE');
  const [date, setDate] = useState(bangkokDateInputValue(new Date()));
  const [time, setTime] = useState('09:00');
  const [courtKind, setCourtKind] = useState<CourtEventKind | ''>('');
  const [title, setTitle] = useState('');
  const [attendees, setAttendees] = useState<string[]>(caseOwnerId ? [caseOwnerId] : user?.id ? [user.id] : []);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [prep, setPrep] = useState(true);
  const [reminders, setReminders] = useState<number[]>([10080, 1440]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => { dialog.current?.showModal(); }, []);

  const people = (ids: string[]) => ids.map((id) => users.find((u) => u.id === id)).filter((u): u is UserItem => !!u);
  const prepOwnerId = attendees.find((id) => id !== user?.id) ?? attendees[0] ?? caseOwnerId ?? user?.id;
  const prepOwner = users.find((u) => u.id === prepOwnerId);
  const eventTitle = kind === 'COURT_DATE' ? (courtKind ? COURT_EVENT_KIND_LABELS[courtKind] : title.trim() || 'นัดศาล') : title.trim();

  const createPrep = async (eventId: string) => {
    if (!token) return;
    const due = new Date(`${date}T00:00:00Z`); due.setUTCDate(due.getUTCDate() - 3);
    await api.createTask(token, caseId, { title: `เตรียมตัวไปศาล: ${eventTitle}`, assigneeId: prepOwnerId, dueDate: due.toISOString().slice(0, 10), createRequestId: `court-prep-${eventId}` });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || saving) return;
    if (!date) { setError('เลือกวันที่ของนัดก่อนบันทึก'); return; }
    if (!eventTitle) { setError(kind === 'DEADLINE' ? 'ใส่ชื่อสิ่งที่ต้องส่ง เช่น ยื่นคำให้การ' : 'ใส่ชื่อนัด เช่น ประชุมกับลูกความ'); return; }
    setSaving(true); setError('');
    const startAt = bangkokInputToIso(`${date}T${time || '09:00'}`);
    const payload = {
      caseId, title: eventTitle, type: kind, startAt,
      courtName: kind === 'COURT_DATE' ? caseCourtName || undefined : undefined,
      courtEventKind: kind === 'COURT_DATE' ? courtKind || null : null,
      assigneeIds: attendees,
      reminderMinutes: reminders.map((m) => (m === 60 ? Math.max(0, Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) - 8 * 60) : m)),
    };
    try {
      let eventId = savedId;
      if (eventId) await api.updateCalendarEvent(token, eventId, payload);
      else { eventId = (await api.createCalendarEvent(token, payload)).id; setSavedId(eventId); }
      onSaved();
      if (kind === 'COURT_DATE' && prep) {
        try { await createPrep(eventId); } catch { setError('บันทึกนัดแล้ว แต่สร้างงานเตรียมตัวไม่สำเร็จ — กด “บันทึกนัด” อีกครั้งเพื่อลองสร้างงานใหม่'); setSaving(false); return; }
      }
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : 'บันทึกนัดไม่สำเร็จ ลองอีกครั้ง');
    } finally { setSaving(false); }
  };

  const chosen = people(attendees);
  const candidates = users.filter((u) => !attendees.includes(u.id) && `${u.firstName} ${u.lastName}`.toLowerCase().includes(query.trim().toLowerCase()));

  return <dialog ref={dialog} aria-labelledby="case-appt-title" onCancel={(e) => { e.preventDefault(); if (!saving) onClose(); }} className="w-[min(36rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-[#fffdfa] p-0 shadow-2xl backdrop:bg-[#101d2a]/45">
    <form onSubmit={save} className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <div className="flex items-start justify-between border-b border-[#e2e0d8] px-6 py-4"><h2 id="case-appt-title" tabIndex={-1} autoFocus className="text-xl font-bold outline-none">เพิ่มนัด</h2><button type="button" onClick={onClose} disabled={saving} aria-label="ปิดหน้าต่างเพิ่มนัด" className={`${v2.btn} ${v2.ghost}`}><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button></div>
      <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
        <fieldset><legend className={v2.flabel}>นัดอะไร</legend><div className="mt-1 grid grid-cols-3 gap-2">{KINDS.map(({ value, label, icon: Icon }) => <label key={value} className={`${v2.btn} ${v2.opt} ${kind === value ? v2.on : ''} cursor-pointer focus-within:ring-2 focus-within:ring-ring`}><input type="radio" name="appt-kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />{kind === value && <Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" />}<Icon aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{label}</label>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-4"><label className="block"><span className={v2.flabel}>วันที่ *</span><ThaiDateField required ariaLabel="วันที่ของนัด" value={date} onChange={setDate} /></label><label className="block"><span className={v2.flabel}>เวลา</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${v2.field} text-base`} /></label></div>
        {kind === 'COURT_DATE' ? <label className="block"><span className={v2.flabel}>นัดเรื่องอะไร</span><select value={courtKind} onChange={(e) => setCourtKind(e.target.value as CourtEventKind | '')} className={`${v2.field} text-base`}><option value="">นัดศาลอื่น ๆ</option>{Object.values(CourtEventKind).map((value) => <option key={value} value={value}>{COURT_EVENT_KIND_LABELS[value]}</option>)}</select><p className={v2.hint}>ระบบใช้ชนิดนัดคำนวณวันครบกำหนดงานที่เกี่ยวข้องให้ เช่น ยื่นบัญชีพยานก่อนวันนัด</p></label>
          : <label className="block"><span className={v2.flabel}>{kind === 'DEADLINE' ? 'ต้องส่งอะไร *' : 'นัดเรื่องอะไร *'}</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'DEADLINE' ? 'เช่น ยื่นคำให้การ' : 'เช่น ซ้อมก่อนสืบพยาน'} className={`${v2.field} text-base`} /></label>}
        <div><span className={v2.flabel}>{kind === 'DEADLINE' ? 'ใครรับผิดชอบ' : 'ใครไปนัดนี้'}</span> <span className={v2.label}>(เลือกได้หลายคน · ไม่ต้องเป็นคุณก็ได้)</span>
          <div className={`${v2.field} mt-1 flex flex-wrap items-center gap-2 py-2`}>
            {chosen.map((u) => <span key={u.id} className="inline-flex items-center gap-2 rounded-full bg-[#e9eef3] py-1 pl-1 pr-2 text-sm font-semibold"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-[#142e43] text-[11px] text-white">{initials(u)}</span>{u.firstName} {u.lastName}{u.id === user?.id ? ' (ฉัน)' : ''}<button type="button" onClick={() => setAttendees((ids) => ids.filter((id) => id !== u.id))} aria-label={`เอา ${u.firstName} ${u.lastName} ออก`} className="text-muted-foreground"><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button></span>)}
            <button type="button" aria-expanded={picking} onClick={() => setPicking((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#7d847e] px-3 py-1 text-sm font-semibold"><UserPlus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />เพิ่มคน</button>
          </div>
          {picking && <div className="mt-2 rounded-lg border border-[#e2e0d8] bg-white p-2"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="พิมพ์ชื่อเพื่อค้นหา" aria-label="ค้นหาคนในสำนักงาน" className={`${v2.field} mt-0 text-base`} autoFocus /><ul className="mt-1 max-h-48 overflow-y-auto overscroll-contain">{candidates.map((u) => <li key={u.id}><button type="button" onClick={() => { setAttendees((ids) => [...ids, u.id]); setQuery(''); }} className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-[#f3f1ea]"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-[#eeebe3] text-[11px]">{initials(u)}</span>{u.firstName} {u.lastName}{u.id === user?.id ? ' (ฉัน)' : ''}</button></li>)}{!candidates.length && <li className={`${v2.hint} px-2 py-2`}>ไม่พบชื่อนี้</li>}</ul></div>}
          <p className={v2.hint}>คนที่เลือกจะเห็นนัดนี้ในปฏิทินของตัวเองและได้รับแจ้งเตือน{chosen.length ? ` · หน้าคดีจะขึ้นว่า “${kind === 'COURT_DATE' ? 'ผู้ไปศาล' : 'ผู้ไปนัด'}: ${chosen.map((u) => u.firstName).join(', ')}”` : ''}</p>
          {kind === 'COURT_DATE' && <label className="mt-3 flex items-start gap-3 rounded-lg bg-[#f3f7fb] p-3 text-sm"><input type="checkbox" checked={prep} onChange={(e) => setPrep(e.target.checked)} className="mt-0.5 h-5 w-5" /><span><b>สร้างงาน “เตรียมตัวไปศาล” ให้ {prepOwner ? prepOwner.firstName : 'คุณ'}</b><span className={`${v2.hint} block`}>ครบก่อนวันนัด 3 วัน — เช่น เตรียมแฟ้ม เอกสารพยาน ใบมอบอำนาจ</span></span></label>}
        </div>
        <fieldset><legend className={v2.flabel}>เตือนทีมก่อนวันนัด</legend><div className="mt-1 flex flex-wrap gap-2">{REMINDERS.map(({ minutes, label }) => { const on = reminders.includes(minutes); return <label key={minutes} className={`${v2.btn} ${v2.opt} ${on ? v2.on : ''} min-h-0 cursor-pointer py-2 focus-within:ring-2 focus-within:ring-ring`}><input type="checkbox" checked={on} onChange={() => setReminders((list) => (on ? list.filter((m) => m !== minutes) : [...list, minutes]))} className="sr-only" />{on && <Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" />}{label}</label>; })}</div></fieldset>
        <button type="button" onClick={onMoreOptions} className="text-sm font-semibold underline">ตั้งค่าเพิ่ม เช่น ประชุมออนไลน์ Teams ระยะเวลา หรือหมายเหตุ</button>
        {error && <p role="alert" className={v2.error}>{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#e2e0d8] px-6 py-4"><button type="button" onClick={onClose} disabled={saving} className={`${v2.btn} ${v2.ghost}`}>ยกเลิก</button><button type="submit" disabled={saving} className={`${v2.btn} ${v2.primary}`}>{saving ? 'กำลังบันทึก…' : 'บันทึกนัด'}</button></div>
    </form>
  </dialog>;
}
