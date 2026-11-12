'use client';

import { useEffect, useState, useCallback } from 'react';
import { calendarPersonColors, eventPeopleIds, eventPersonId } from '@/lib/calendar-person-colors';
import type { OutlookCalendarItemDto, OutlookCalendarItemsResponse } from '@lawfirm/shared';
import { Plus, Bell, X, ListOrdered, CalendarDays, Palette, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsList } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseListItem, UserItem, PublicHolidayItem } from '@/lib/api';
import { OutlookCalendarView } from '@/components/calendar/OutlookCalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { FirmDayAgenda } from '@/components/calendar/FirmDayAgenda';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatDateTime } from '@/lib/utils';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { confirmDialog } from '@/lib/confirm-dialog';
import { Select } from '@/components/ui/select';

const EVENT_COLORS: Record<string, string> = {
  COURT_DATE: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  CLIENT_MEETING: 'bg-accent text-primary dark:bg-brand-700 dark:text-primary',
  DEADLINE: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  OTHER: 'bg-muted text-foreground dark:bg-sidebar dark:text-muted-foreground',
  LEAVE: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
};

const LEAVE_LABELS = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'พักร้อน' } as const;

export function CalendarWorkspace({ defaultView }: { defaultView: 'day' | 'month' }) {
  const router = useRouter();
  const params = useSearchParams();
  const d = useDashboardT();
  const EVENT_TYPE_LABELS: Record<string, string> = {
    COURT_DATE: d.calendar.typeCourtDate,
    CLIENT_MEETING: d.calendar.typeClientMeeting,
    DEADLINE: d.calendar.typeDeadline,
    OTHER: d.calendar.typeOther,
    LEAVE: 'ลางาน',
  };
  const { token, user } = useAuth();
  const view = params.get('view') === 'day' ? 'day' : params.get('view') === 'month' ? 'month' : defaultView;
  const setView = (v: 'day' | 'month') => { const next = new URLSearchParams(params.toString()); next.set('view', v); router.replace(`?${next.toString()}`, { scroll: false }); };
  const [showOutlook, setShowOutlook] = useState(true);
  const [outlook, setOutlook] = useState<OutlookCalendarItemsResponse>({ items: [], syncedAt: null });
  const [selectedOutlook, setSelectedOutlook] = useState<OutlookCalendarItemDto | null>(null);
  const [outlookError, setOutlookError] = useState(false);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [month, setMonth] = useState(new Date());
  const [weekStart, setWeekStart] = useState(() => new Date(`${bangkokDateInputValue(new Date())}T00:00:00+07:00`));
  const shiftWeek = (days: number) => setWeekStart(current => { const d = new Date(current); d.setUTCDate(d.getUTCDate() + days); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); return d; });
  const [holidays, setHolidays] = useState<PublicHolidayItem[]>([]);
  const [personFilter, setPersonFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialog, setDialog] = useState<
    { event: CalendarEventItem | null; defaultDate?: Date } | null
  >(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedLeave, setSelectedLeave] = useState<CalendarEventItem | null>(null);
  const [leaveError, setLeaveError] = useState('');

  useEffect(() => {
    if (!token) return;
    // Lawyers only: the picker names who is attending a hearing.
    api.getLawyers(token).then(setUsers).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.getPublicHolidays(token, month.getFullYear()).then(setHolidays).catch(() => setHolidays([]));
  }, [token, view, month]);

  const loadEvents = useCallback(async () => {
    if (!token) return;
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const [appointments, leaves] = await Promise.all([
      api.getCalendarEvents(token, { from, to }),
      api.getLeaves(token, dateKey(new Date(month.getFullYear(), month.getMonth() - 1, 1)), dateKey(new Date(month.getFullYear(), month.getMonth() + 2, 0))),
    ]);
    const leaveDays: CalendarEventItem[] = leaves.filter((leave) => leave.status === 'APPROVED').flatMap((leave) => {
      const days: CalendarEventItem[] = [];
      const cursor = new Date(`${leave.startDate.slice(0, 10)}T00:00:00Z`);
      const end = leave.endDate.slice(0, 10);
      while (cursor.toISOString().slice(0, 10) <= end) {
        const date = cursor.toISOString().slice(0, 10);
        days.push({
          id: `leave:${leave.id}:${date}`,
          title: `${LEAVE_LABELS[leave.type]} · ${leave.user.firstName} ${leave.user.lastName}`,
          type: 'LEAVE',
          startAt: `${date}T09:00:00+07:00`,
          endAt: `${date}T18:00:00+07:00`,
          assigneeId: leave.userId,
          leaveId: leave.id,
          leaveType: leave.type,
          leaveOwnerId: leave.userId,
          leaveStartDate: leave.startDate.slice(0, 10),
          leaveEndDate: leave.endDate.slice(0, 10),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return days;
    });
    setEvents([...appointments, ...leaveDays].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
  }, [token, month]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    Promise.all([loadEvents(), api.getCases(token).then(setCases)])
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.common.loadFailed))
      .finally(() => setLoading(false));
  }, [token, view, loadEvents, reloadKey, d.common.loadFailed]);

  useEffect(() => { if (!user?.id) return; try { setShowOutlook(localStorage.getItem(`outlook-calendar:${user.id}`) !== 'false'); } catch { setShowOutlook(true); } }, [user?.id]);
  useEffect(() => {
    if (!token || !showOutlook) { setOutlook({ items: [], syncedAt: null }); return; }
    let current = true;
    const from = view === 'day' ? weekStart : new Date(month.getFullYear(), month.getMonth(), 1);
    const to = view === 'day' ? new Date(weekStart.getTime() + 7 * 86400000) : new Date(month.getFullYear(), month.getMonth() + 1, 1);
    api.getOutlookCalendarItems(token, from.toISOString(), to.toISOString()).then(data => { if (current) { setOutlook(data); setOutlookError(false); } }).catch(() => { if (current) { setOutlook({ items: [], syncedAt: null }); setOutlookError(true); } });
    return () => { current = false; };
  }, [token, showOutlook, view, weekStart, month, reloadKey]);

  // "รายคน": events carry assigneeId; ones with no explicit assignee follow the
  // case's lead lawyer for both filtering and color.
  const people = new Map(users.map(person => [person.id, `${person.firstName} ${person.lastName}`]));
  for (const event of events) {
    if (event.leaveId && event.assigneeId) people.set(event.assigneeId, event.title.split(' · ')[1] ?? 'สมาชิกสำนักงาน');
    const lead = event.case?.leadLawyer;
    if (lead && !people.has(lead.id)) people.set(lead.id, `${lead.firstName} ${lead.lastName}`);
    if (event.assigneeId && !people.has(event.assigneeId)) people.set(event.assigneeId, 'ผู้รับผิดชอบ (ไม่พบชื่อ)');
  }
  const personColors = calendarPersonColors([...people.keys()]);
  const personAppearance = (event: { id: string }) => {
    const source = events.find(item => item.id === event.id);
    const id = source ? eventPersonId(source) : null;
    return { name: id ? people.get(id) ?? 'ผู้รับผิดชอบ (ไม่พบชื่อ)' : 'ยังไม่ระบุผู้รับผิดชอบ', color: id ? personColors.get(id) ?? '#64748b' : '#64748b' };
  };
  const visibleEvents = personFilter ? events.filter((e) => eventPeopleIds(e).includes(personFilter)) : events;
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  useEffect(() => { setSelectedOutlook(null); }, [personFilter, view, month, weekStart]);
  const visibleOutlook = showOutlook && (!personFilter || personFilter === user?.id) ? outlook.items : [];
  const dayEvents = visibleEvents.filter(event => new Date(event.startAt) >= weekStart && new Date(event.startAt) < weekEnd);
  const openEvent = (event: CalendarEventItem) => {
    if (event.leaveId) { setLeaveError(''); setSelectedLeave(event); }
    else setDialog({ event });
  };

  const upcoming = visibleEvents
    .filter((e) => new Date(e.leaveId ? e.endAt ?? e.startAt : e.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);

  return (
    <div className="pb-24">
      <PageHeader title="ตารางนัด" description="นัดศาล นัดลูกความ และกำหนดส่งของทุกคนในสำนักงาน" />
      <Tabs value={view} onValueChange={v => setView(v as 'day' | 'month')}>
        <TabsList role="tablist" aria-label="มุมมองตารางนัด" className="grid grid-cols-2 gap-0 rounded-xl border bg-card shadow-sm">
          {([{ id: 'day', label: 'รายวัน', Icon: ListOrdered }, { id: 'month', label: 'รายเดือน', Icon: CalendarDays }] as const).map(({ id, label, Icon }, index) => <button key={id} id={`calendar-tab-${id}`} role="tab" aria-selected={view === id} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'day' : e.key === 'End' ? 'month' : index === 0 ? 'month' : 'day'; setView(next); document.getElementById(`calendar-tab-${next}`)?.focus(); } }} className={`flex min-h-14 items-center justify-center gap-2 border-b-2 font-semibold ${view === id ? 'border-primary bg-muted' : 'border-transparent text-muted-foreground'}`}><Icon className="h-4 w-4" aria-hidden />{label}{id === 'day' && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{dayEvents.length}</span>}</button>)}
        </TabsList>
      </Tabs>
      <div className="my-6 flex flex-col gap-4 rounded-xl border bg-card p-5 pb-9 shadow-sm sm:flex-row sm:items-end sm:gap-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-6 gap-y-4">
        <label className="space-y-1 text-sm"><span className="block">แสดงนัดของ</span><Select aria-label="แสดงนัดของ" value={personFilter} onChange={e => setPersonFilter(e.target.value)} className="h-11 rounded-lg border border-input bg-card px-3"><option value="">ทุกคน</option>{[...people.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        <div className="text-sm"><span className="block">นัดจาก Outlook</span><label className="flex h-11 items-center gap-2"><span className="relative inline-flex shrink-0 items-center"><input type="checkbox" role="switch" aria-label="นัดจาก Outlook" aria-checked={showOutlook} checked={showOutlook} onChange={e => { setShowOutlook(e.target.checked); setSelectedOutlook(null); try { if (user?.id) localStorage.setItem(`outlook-calendar:${user.id}`, String(e.target.checked)); } catch {} }} className="peer sr-only" /><span aria-hidden className="h-6 w-11 rounded-full bg-muted-foreground/30 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring" /><span aria-hidden className="absolute left-1 h-4 w-4 rounded-full bg-card transition-transform peer-checked:translate-x-5" /></span><span className="text-xs text-muted-foreground">เห็นเฉพาะคุณ</span></label></div>
        <details className="text-sm"><summary className="flex min-h-11 cursor-pointer items-center gap-1 text-primary"><Palette className="h-4 w-4" aria-hidden />สีของแต่ละคน</summary><div className="flex flex-wrap gap-2">{[...people.entries()].map(([id, name]) => <button key={id} type="button" aria-pressed={personFilter === id} onClick={() => setPersonFilter(personFilter === id ? '' : id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-2"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: personColors.get(id) }} />{name}</button>)}</div></details>
        {view === 'day' && <div className="text-sm"><span className="block text-muted-foreground">ช่วงเวลา</span><div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="icon" aria-label="สัปดาห์ก่อน" title="กดเพื่อดูสัปดาห์ก่อน" onClick={() => shiftWeek(-7)}><ChevronLeft className="h-4 w-4" aria-hidden /></Button><Button variant="outline" title="กดเพื่อกลับไปวันนี้" onClick={() => { const d = new Date(`${bangkokDateInputValue(new Date())}T00:00:00+07:00`); setWeekStart(d); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>วันนี้</Button><Button variant="outline" size="icon" aria-label="สัปดาห์ถัดไป" title="กดเพื่อดูสัปดาห์ถัดไป" onClick={() => shiftWeek(7)}><ChevronRight className="h-4 w-4" aria-hidden /></Button><span className="font-semibold">{weekStart.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })} ถึง {new Date(weekEnd.getTime() - 1).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })}</span></div></div>}
        </div>
        <div className="relative shrink-0 self-end"><Button title="กดเพื่อลงนัดศาล นัดลูกความ หรือกำหนดส่ง" onClick={() => setDialog({ event: null, defaultDate: new Date() })}><Plus className="h-4 w-4" aria-hidden />เพิ่มนัด</Button><p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-muted-foreground">กดเพื่อลงนัดศาล นัดลูกความ หรือกำหนดส่ง</p></div>
      </div>
      {outlookError && showOutlook && <p role="alert" className="mb-3 text-sm text-destructive">โหลดนัดจาก Outlook ไม่สำเร็จ</p>}
      {view === 'day' ? (
        <div className="grid gap-6 lg:grid-cols-4"><Card className="lg:col-span-3">
          <CardContent className="p-4">
            {loading ? (
              <div role="status" aria-label={d.calendar.loading} className="space-y-3">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : loadError ? (
              <LoadFailed message={loadError} onRetry={() => setReloadKey((n) => n + 1)} />
            ) : (
              <FirmDayAgenda
                events={dayEvents}
                outlookItems={visibleOutlook}
                selectedOutlook={selectedOutlook?.id}
                onOutlookClick={setSelectedOutlook}
                users={users}
                personColors={personColors}
                onEventClick={openEvent}
                filterName={personFilter ? people.get(personFilter) : undefined}
                onClearFilter={() => setPersonFilter('')}
                onAdd={() => setDialog({ event: null, defaultDate: new Date() })}
              />
            )}
          </CardContent>
        </Card><div>{selectedOutlook && <OutlookDetail item={selectedOutlook} onClose={() => setSelectedOutlook(null)} />}</div></div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3">
            {loading ? (
              <Card>
                <CardContent role="status" aria-label={d.calendar.loading} className="p-4">
                  <Skeleton className="h-[420px] w-full" />
                </CardContent>
              </Card>
            ) : loadError ? (
              <LoadFailed message={loadError} onRetry={() => setReloadKey((n) => n + 1)} />
            ) : (
              <Card>
                <CardContent className="p-4">
                  <OutlookCalendarView
                    outlookItems={visibleOutlook}
                    selectedOutlook={selectedOutlook?.id}
                    onOutlookClick={setSelectedOutlook}
                    events={visibleEvents}
                    personAppearance={personAppearance}
                    holidays={holidays}
                    month={month}
                    onMonthChange={setMonth}
                    onDayClick={(date) => setDialog({ event: null, defaultDate: date })}
                    onEventClick={(ev) => {
                      const event = events.find((e) => e.id === ev.id);
                      if (event) openEvent(event);
                    }}
                  />
                </CardContent>
              </Card>
            )}
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              <span className="text-muted-foreground">ประเภทนัด:</span>
              {Object.entries(EVENT_COLORS).map(([type, color]) => (
                <span key={type} className={`rounded-full px-2 py-0.5 font-medium ${color}`}>
                  {EVENT_TYPE_LABELS[type]}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">{selectedOutlook && <OutlookDetail item={selectedOutlook} onClose={() => setSelectedOutlook(null)} />}<Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4 text-muted-foreground" aria-hidden />
                {d.calendar.upcomingReminders}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              {!loading && loadError && <p role="alert" className="text-sm text-destructive">{d.common.loadFailed}</p>}
              {!loading && !loadError && upcoming.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  style={{ borderLeft: `4px solid ${personAppearance(e).color}` }}
                  onClick={() => openEvent(e)}
                  className="w-full rounded-lg border border-border p-3 text-left hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{e.title}</p>
                    <Badge className={EVENT_COLORS[e.type] ?? EVENT_COLORS.OTHER} variant="outline">
                      {EVENT_TYPE_LABELS[e.type] ?? EVENT_TYPE_LABELS.OTHER}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs font-medium">{personAppearance(e).name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{e.leaveId ? `${e.leaveStartDate} · ทั้งวัน` : formatDateTime(e.startAt)}</p>
                  {e.case && <p className="text-xs text-primary">{e.case.ownRef}</p>}
                </button>
              ))}
              {upcoming.length === 0 && !loading && !loadError && (
                <InlineEmptyState
                  title={d.calendar.noUpcoming}
                  action={
                    <Button size="sm" variant="outline" onClick={() => setDialog({ event: null, defaultDate: new Date() })}>
                      <Plus className="h-4 w-4" aria-hidden />
                      {d.calendar.addEvent}
                    </Button>
                  }
                />
              )}
            </CardContent>
          </Card></div>
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground"><span className="rounded-full border border-dashed bg-muted px-2 py-1">Outlook (ดูอย่างเดียว)</span>{outlook.syncedAt && <p className="mt-3">ดึงนัดจาก Outlook ล่าสุด {new Date(outlook.syncedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}</p>}</div>
      {dialog && (
        <CalendarEventDialog
          cases={cases}
          users={users}
          event={dialog.event}
          defaultDate={dialog.defaultDate}
          onClose={() => setDialog(null)}
          onSaved={loadEvents}
        />
      )}
      {selectedLeave && (
        <div role="dialog" aria-modal="true" aria-label="รายละเอียดการลา" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-xl">
            <h2 className="text-lg font-semibold">{selectedLeave.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{selectedLeave.leaveStartDate} ถึง {selectedLeave.leaveEndDate} · ทั้งวัน</p>
            {leaveError && <p role="alert" className="mt-3 text-sm text-destructive">{leaveError}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedLeave(null)}>ปิด</Button>
              {user?.id === selectedLeave.leaveOwnerId && selectedLeave.leaveId && token && (
                <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
                  if (!await confirmDialog(`ยกเลิก${selectedLeave.title} ${selectedLeave.leaveStartDate} ถึง ${selectedLeave.leaveEndDate}?`)) return;
                  try { await api.cancelLeave(token, selectedLeave.leaveId!); }
                  catch (error) {
                    setLeaveError(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่');
                    return;
                  }
                  setSelectedLeave(null);
                  void loadEvents().catch((error) => setLoadError(error instanceof Error ? error.message : d.common.loadFailed));
                }}>ยกเลิกทั้งช่วงลา</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OutlookDetail({ item, onClose }: { item: OutlookCalendarItemDto; onClose: () => void }) {
  const time = (value: string) => new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  return <Card><CardContent className="space-y-4 p-4"><div className="flex items-center justify-between"><Badge variant="muted">นัดจาก Outlook</Badge><Button size="icon" variant="ghost" aria-label="ปิดรายละเอียด" onClick={onClose}><X className="h-4 w-4" /></Button></div><h2 className="text-lg font-semibold">{item.subject || 'ไม่มีชื่อ'}</h2><p className="text-sm">{item.isAllDay ? 'ทั้งวัน' : `${formatDateTime(item.startAt)}–${time(item.endAt)}`}{item.location && ` · ${item.location}`}</p><p className="text-sm text-muted-foreground">จากบัญชี {item.mailboxAddress}</p><p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">นัดนี้มาจาก Outlook แก้ไขหรือลบได้ใน Outlook เท่านั้น</p>{item.webLink && <><Button variant="outline" className="w-full" onClick={() => window.open(item.webLink!, '_blank', 'noopener,noreferrer')}>เปิดใน Outlook</Button><p className="text-center text-xs text-muted-foreground">กดเพื่อเปิดนัดนี้ใน Outlook บนเว็บ</p></>}</CardContent></Card>;
}
