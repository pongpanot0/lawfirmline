'use client';
import Link from 'next/link';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlarmClock, Calculator, CalendarDays, ChevronDown, List, Plus, Scale, Sparkles, Users, X } from 'lucide-react';
import v2 from '@/components/case-page/v2.module.css';
import { CaseAppointmentDialog } from '@/components/case-page/CaseAppointmentDialog';
import { DeadlineTrigger } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, DateSuggestionItem, UserItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { CaseTimelineView } from '@/components/cases/CaseTimelineView';
import { Button } from '@/components/ui/button';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

export function CaseCalendarPanel({ caseId, onChanged }: { caseId: string; onChanged?: () => void }) {
  const d = useDashboardT();
  const params = useSearchParams();
  const requestedEvent = params.get('eventId');
  const newEvent = params.get('new') === 'event';
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [legalCase, setLegalCase] = useState<CaseItem | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [month, setMonth] = useState(new Date());
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline');
  const [loading, setLoading] = useState(true);
  // Full-page loader on the first load only; later reloads refresh in place so the
  // suggestions panel (and its unsaved drafts) stays mounted.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<
    { event: CalendarEventItem | null; defaultDate?: Date; full?: boolean } | null
  >(null);

  useEffect(() => {
    if (!newEvent) return;
    setDialog({ event: null, defaultDate: new Date() });
    const url = new URL(window.location.href); url.searchParams.delete('new'); window.history.replaceState(window.history.state, '', url);
  }, [newEvent]);

  const [triggerDate, setTriggerDate] = useState('');
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [suggestionsKey, setSuggestionsKey] = useState(0);
  const [suggestions, setSuggestions] = useState<DateSuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);

  useEffect(() => {
    if (!token || !caseId) return;
    let active = true;
    api.getDateSuggestions(token, caseId, 'PENDING').then((items) => { if (active) { setSuggestions(items.filter((item) => item.source === 'DOCUMENT' || item.source === 'EMAIL' || item.source === 'RULE' || item.source === 'MCP')); setSuggestionsError(false); } }).catch(() => { if (active) setSuggestionsError(true); });
    return () => { active = false; };
  }, [token, caseId, suggestionsKey, reloadKey]);

  useEffect(() => {
    if (!token) return;
    // Lawyers only: the picker names who is attending a hearing.
    api.getLawyers(token).then(setUsers).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token || !caseId) return;
    api.getCase(token, caseId).then(setLegalCase).catch(console.error);
  }, [token, caseId]);

  useEffect(() => {
    if (!token || !caseId) return;
    // Timeline shows the whole case history; the calendar only needs the
    // visible month plus its neighbours.
    const from =
      view === 'timeline'
        ? new Date(2000, 0, 1).toISOString()
        : new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to =
      view === 'timeline'
        ? new Date(new Date().getFullYear() + 3, 0, 1).toISOString()
        : new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    setLoading(true);
    setLoadError('');
    api
      .getCalendarEvents(token, { from, to })
      .then((all) => {
        setEvents(all.filter((e) => e.case?.id === caseId));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.common.loadFailed))
      .finally(() => {
        setLoading(false);
        setLoadedOnce(true);
      });
  }, [token, caseId, month, view, reloadKey, d.common.loadFailed]);

  useEffect(() => {
    if (!requestedEvent || !token) return;
    let active = true;
    api.getCalendarEvent(token, requestedEvent).then(event => {
      if (active && event.case?.id === caseId) setDialog({ event });
    }).catch(err => { if (active) setLoadError(err.message); });
    return () => { active = false; };
  }, [requestedEvent, token, caseId]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !caseId) return;
    setApplying(true);
    setError('');
    setNotice('');
    try {
      const result = await api.applyDeadlineTrigger(token, caseId, {
        trigger: DeadlineTrigger.ORDER_RECEIVED,
        triggerDate: new Date(triggerDate).toISOString(),
      });
      setNotice(
        result.created > 0
          ? fmt(d.dateSuggestions.applied, { count: result.created })
          : d.dateSuggestions.appliedNone,
      );
      setSuggestionsKey((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.dateSuggestions.applyFailed);
    } finally {
      setApplying(false);
    }
  };

  if (loading && !loadedOnce) return <PageLoading title={d.calendar.loading} lines={3} />;

  const now = Date.now();
  const upcoming = events.filter((event) => Date.parse(event.startAt) >= now - 3600_000).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  const past = events.filter((event) => Date.parse(event.startAt) < now - 3600_000).sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
  const fmtPart = (value: string, options: Intl.DateTimeFormatOptions) => new Date(value).toLocaleDateString('th-TH', { ...options, timeZone: 'Asia/Bangkok' });
  const who = (event: CalendarEventItem) => event.assignees?.length ? event.assignees.map((a) => a.user.firstName).join(', ') : users.filter((u) => u.id === event.assigneeId).map((u) => u.firstName).join('');
  const remind = (event: CalendarEventItem) => (event.reminderMinutes ?? []).filter((m) => m >= 1440).sort((a, b) => b - a).map((m) => `${Math.round(m / 1440)} วัน`);
  const kind = (event: CalendarEventItem) => event.type === 'COURT_DATE' ? <span className="inline-flex items-center gap-1 rounded-full bg-[#eeebe3] px-3 py-1 text-xs font-semibold"><Scale aria-hidden="true" className="h-[1.1em] w-[1.1em]" />นัดศาล</span> : event.type === 'CLIENT_MEETING' ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e6eef7] px-3 py-1 text-xs font-semibold text-[#2b5a8a]"><Users aria-hidden="true" className="h-[1.1em] w-[1.1em]" />นัดลูกความ</span> : event.type === 'DEADLINE' ? <span className="inline-flex items-center gap-1 rounded-full bg-[#fbf3e0] px-3 py-1 text-xs font-semibold text-[#6b4f0b]"><AlarmClock aria-hidden="true" className="h-[1.1em] w-[1.1em]" />กำหนดส่ง</span> : <span className="rounded-full bg-[#eeebe3] px-3 py-1 text-xs font-semibold">นัดอื่น</span>;
  const card = (event: CalendarEventItem, first: boolean) => {
    const days = (Date.parse(event.startAt) - now) / 86400000;
    const people = who(event); const reminders = remind(event);
    return <article key={event.id} className={`${v2.card} flex flex-wrap items-center gap-5 p-5 ${first ? 'shadow-[0_4px_16px_rgba(20,46,67,.06)]' : ''}`}>
      <div className={`w-20 rounded-lg py-2 text-center ${first ? 'bg-[#142e43] text-white' : 'bg-[#eeebe3]'}`}><div className="text-xs">{fmtPart(event.startAt, { month: 'short' })}</div><div className="text-3xl font-bold leading-none">{fmtPart(event.startAt, { day: 'numeric' })}</div><div className="text-xs">{fmtPart(event.startAt, { weekday: 'long' }).replace(/^วัน/, '')}</div></div>
      <div className="min-w-0 flex-1">{kind(event)}<h4 className="mt-1 text-lg font-bold">{event.title}</h4><p className="text-sm">{[new Date(event.startAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }), event.courtName, event.onlineMeetingUrl ? 'ออนไลน์ (Teams)' : null, days >= 0 ? (days < 1 ? 'วันนี้' : `อีก ${Math.ceil(days)} วัน`) : null].filter(Boolean).join(' · ')}</p>{(reminders.length > 0 || people) && <p className={v2.hint}>{[reminders.length ? `เตือนทีมก่อน ${reminders.join(' และ ')}` : null, people ? `${event.type === 'COURT_DATE' ? 'ผู้ไปศาล' : 'ผู้ไปนัด'}: ${people}` : null].filter(Boolean).join(' · ')}</p>}</div>
      <div className="flex gap-2">{event.type === 'COURT_DATE' && <Link href={`/court-day/${event.id}`} title="เตรียมเอกสารและบันทึกผลนัดนี้" className={`${v2.btn} ${v2.primary}`}>เปิดแฟ้มไปศาล</Link>}<button type="button" className={`${v2.btn} ${v2.outline}`} onClick={() => setDialog({ event })}>แก้ไข</button></div>
    </article>;
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">นัดที่กำลังจะมาถึง</h3><div className="flex flex-wrap items-center gap-2"><div role="group" aria-label="มุมมองปฏิทิน" className="grid grid-cols-2 rounded-lg border border-[#c9ccc6] bg-white p-0.5 text-sm font-semibold">{([{ value: 'timeline', label: 'รายการ', Icon: List }, { value: 'calendar', label: 'ปฏิทินเดือน', Icon: CalendarDays }] as const).map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={`inline-flex items-center gap-1 rounded-md px-3 py-2 ${view === value ? 'bg-[#142e43] text-white' : 'text-[#52616b]'}`}><Icon aria-hidden="true" className="h-4 w-4" />{label}</button>)}</div><button type="button" className={`${v2.btn} ${v2.outline}`} onClick={() => setShowCalculator(true)}><Calculator aria-hidden="true" className="h-4 w-4" />คำนวณวันครบกำหนด</button><button type="button" className={`${v2.btn} ${v2.primary}`} onClick={() => setDialog({ event: null, defaultDate: new Date() })}><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />เพิ่มนัด</button></div></div>
      <p className={v2.hint}>“คำนวณวันครบกำหนด” ใส่วันที่ได้รับคำสั่งศาล ระบบคำนวณวันยื่นต่าง ๆ ให้ แล้วถามก่อนเพิ่มเป็นนัด</p>
      {suggestions.length > 0 && <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-[#c9d6e3] bg-[#f3f7fb] px-5 py-4"><div className="flex items-start gap-3"><Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 text-[#2b5a8a]" /><div><b>{suggestions.some((item) => item.source !== 'RULE') ? `ระบบพบวันที่แนะนำ ${suggestions.length} รายการ` : `วันครบกำหนดที่ระบบคำนวณให้ ${suggestions.length} รายการ รอยืนยัน`}</b><p className={v2.hint}>{suggestions.slice(0, 2).map((item) => `“${item.label} · ${fmtPart(item.suggestedDate, { day: 'numeric', month: 'short' })}”`).join(' และ ')} — ยังไม่ได้เพิ่มเป็นนัด</p></div></div><button type="button" aria-expanded={showSuggestions} className={`${v2.btn} ${v2.primary}`} onClick={() => setShowSuggestions(!showSuggestions)}>ตรวจและเพิ่ม</button></section>}
      {suggestionsError && <p role="alert" className={v2.error}>โหลดวันที่แนะนำไม่สำเร็จ ลองโหลดหน้าใหม่ <button type="button" className="underline" onClick={() => setSuggestionsKey((n) => n + 1)}>ลองใหม่</button></p>}
      {showSuggestions && <DateSuggestionsPanel caseId={caseId} sources={['DOCUMENT', 'EMAIL', 'MCP']} title={d.dateSuggestions.documentTitle} reloadKey={suggestionsKey} onChanged={() => { setSuggestionsKey((n) => n + 1); setReloadKey((n) => n + 1); onChanged?.(); }} />}
      {showSuggestions && <DateSuggestionsPanel caseId={caseId} sources={['RULE']} title={d.dateSuggestions.ruleTitle} reloadKey={suggestionsKey} onChanged={() => { setSuggestionsKey((n) => n + 1); setReloadKey((n) => n + 1); onChanged?.(); }} />}
      {loadError ? <LoadFailed message={loadError} onRetry={() => setReloadKey((n) => n + 1)} /> : view === 'calendar' ? <CalendarView events={events} month={month} onMonthChange={setMonth} onDayClick={(date) => setDialog({ event: null, defaultDate: date })} onEventClick={(ev) => setDialog({ event: events.find((e) => e.id === ev.id) ?? null })} /> : <><div className="space-y-3">{upcoming.length ? upcoming.map((event, index) => card(event, index === 0)) : <section className={`${v2.card} p-5`}><p className="font-semibold">ยังไม่มีนัดที่กำลังจะมาถึง</p><p className={v2.hint}>กด “เพิ่มนัด” เพื่อลงนัดศาลหรือนัดลูกความ ระบบจะเตือนทีมให้</p></section>}</div>{past.length > 0 && <details className={`${v2.card} group`}><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"><span><b>นัดที่ผ่านมา ({past.length})</b> <span className={v2.label}>· ล่าสุด {past[0].title} {fmtPart(past[0].startAt, { day: 'numeric', month: 'short' })}</span></span><span className="inline-flex items-center gap-1 text-sm font-semibold underline">ดู <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" /></span></summary><div className="space-y-3 border-t border-[#e2e0d8] p-5">{past.map((event) => card(event, false))}</div></details>}<details className={v2.card}><summary className="cursor-pointer px-5 py-3 font-semibold">ไทม์ไลน์คดี</summary><div className="p-5"><CaseTimelineView events={events} onEventClick={(event) => setDialog({ event })} /></div></details></>}
      {showCalculator && <div role="dialog" aria-modal="true" aria-labelledby="calendar-calculate-title" onKeyDown={(event) => { if (event.key === 'Escape' && !applying) setShowCalculator(false); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5"><div className="flex justify-between"><h2 id="calendar-calculate-title" className="text-lg font-bold">คำนวณวันครบกำหนด</h2><button type="button" aria-label="ปิด" onClick={() => setShowCalculator(false)} className={`${v2.btn} ${v2.ghost}`}><X aria-hidden="true" className="h-5 w-5" /></button></div><p className={v2.hint}>{d.dateSuggestions.applyTriggerHint}</p><form onSubmit={handleApply} className="space-y-3"><label className="block text-sm"><span className="mb-1 block">{d.dateSuggestions.applyTriggerDate}</span><ThaiDateInput required value={triggerDate} onChange={setTriggerDate} /></label><Button type="submit" disabled={applying}>{d.dateSuggestions.applyTrigger}</Button></form>{notice && <p role="status" className={v2.hint}>{notice}</p>}{error && <p role="alert" className={v2.error}>{error}</p>}</div></div>}
      {dialog && !dialog.event && !dialog.full && (
        <CaseAppointmentDialog caseId={caseId} caseCourtName={legalCase?.courtName} caseOwnerId={legalCase?.leadLawyerId} users={users} onClose={() => setDialog(null)} onSaved={() => { setReloadKey((n) => n + 1); onChanged?.(); }} onMoreOptions={() => setDialog({ event: null, defaultDate: new Date(), full: true })} />
      )}
      {dialog && (dialog.event || dialog.full) && (
        <CalendarEventDialog
          caseId={caseId}
          caseCourtName={legalCase?.courtName}
          caseOwnerId={legalCase?.leadLawyerId}
          users={users}
          event={dialog.event}
          defaultDate={dialog.defaultDate}
          onClose={() => setDialog(null)}
          onSaved={() => { setReloadKey((n) => n + 1); onChanged?.(); }}
        />
      )}
    </div>
  );
}
