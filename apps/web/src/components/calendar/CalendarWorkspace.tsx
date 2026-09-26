'use client';

import { useEffect, useState, useCallback } from 'react';
import { calendarPersonColors, eventPersonId } from '@/lib/calendar-person-colors';
import { Plus, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, UserItem, PublicHolidayItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { MyDayPanel } from '@/components/agenda/MyDayPanel';
import { FirmDayAgenda } from '@/components/calendar/FirmDayAgenda';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const EVENT_COLORS: Record<string, string> = {
  COURT_DATE: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  CLIENT_MEETING: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  DEADLINE: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  OTHER: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  LEAVE: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
};

const LEAVE_LABELS = { SICK: 'ลาป่วย', PERSONAL: 'ลากิจ', VACATION: 'พักร้อน' } as const;

/**
 * One calendar workspace behind /my-day and /court-schedule: the same page
 * with two views — "วันของฉัน" (your today/tomorrow agenda) and the firm's
 * month calendar. The route only picks which view opens first.
 */
export function CalendarWorkspace({ defaultView }: { defaultView: 'day' | 'month' | 'agenda' }) {
  const d = useDashboardT();
  const EVENT_TYPE_LABELS: Record<string, string> = {
    COURT_DATE: d.calendar.typeCourtDate,
    CLIENT_MEETING: d.calendar.typeClientMeeting,
    DEADLINE: d.calendar.typeDeadline,
    OTHER: d.calendar.typeOther,
    LEAVE: 'ลางาน',
  };
  const { token, user } = useAuth();
  const [view, setView] = useState<'day' | 'month' | 'agenda'>(defaultView);
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [month, setMonth] = useState(new Date());
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
    if (!token || view === 'day') return;
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
    if (!token || view === 'day') return;
    setLoading(true);
    setLoadError('');
    Promise.all([loadEvents(), api.getCases(token).then(setCases)])
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.common.loadFailed))
      .finally(() => setLoading(false));
  }, [token, view, loadEvents, reloadKey, d.common.loadFailed]);

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
  const visibleEvents = personFilter ? events.filter((e) => eventPersonId(e) === personFilter) : events;
  const openEvent = (event: CalendarEventItem) => {
    if (event.leaveId) { setLeaveError(''); setSelectedLeave(event); }
    else setDialog({ event });
  };

  const upcoming = visibleEvents
    .filter((e) => new Date(e.leaveId ? e.endAt ?? e.startAt : e.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={view === 'day' ? d.myDay.title : view === 'agenda' ? 'ตารางรายวันของสำนักงาน' : d.calendar.title}
        description={
          view === 'day'
            ? d.myDay.description
            : view === 'agenda'
              ? 'ใครไปไหนวันไหน เรียงตามวัน พร้อมเตือนเมื่อมีคนถูกจองซ้อน'
              : d.calendar.description
        }
        actions={
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label={d.calendar.title} className="flex rounded-lg border border-border p-0.5">
              {(['day', 'agenda', 'month'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-xs ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {v === 'day' ? d.myDay.title : v === 'agenda' ? 'ตารางรายวัน' : d.calendar.title}
                </button>
              ))}
            </div>
            {view !== 'day' && (
              <select
                aria-label="กรองตามผู้รับผิดชอบ"
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2 text-xs"
              >
                <option value="">ทุกคน</option>
                {[...people.entries()].map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
            {view !== 'day' && (
              <Button size="sm" onClick={() => setDialog({ event: null, defaultDate: new Date() })}>
                <Plus className="h-4 w-4" />
                {d.calendar.addEvent}
              </Button>
            )}
          </div>
        }
      />

      {view !== 'day' && <div aria-label="สีประจำผู้รับผิดชอบ" className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">สีประจำผู้รับผิดชอบ:</span>
        {[...people.entries()].map(([id, name]) => <button key={id} type="button" aria-pressed={personFilter === id} onClick={() => setPersonFilter(personFilter === id ? '' : id)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-2.5 ${personFilter === id ? 'border-primary bg-primary/5' : 'border-border'}`}><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: personColors.get(id) }} />{name}</button>)}
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-full bg-slate-500" />ยังไม่ระบุผู้รับผิดชอบ</span>
      </div>}
      {view === 'day' ? (
        <MyDayPanel />
      ) : view === 'agenda' ? (
        <Card>
          <CardContent className="p-4">
            {loading ? (
              <PageLoading title={d.calendar.loading} lines={2} />
            ) : loadError ? (
              <div className="space-y-3">
                <p role="alert" className="text-sm text-destructive">{loadError}</p>
                <Button size="sm" variant="outline" onClick={() => setReloadKey((n) => n + 1)}>
                  {d.common.retry}
                </Button>
              </div>
            ) : (
              <FirmDayAgenda
                events={visibleEvents}
                users={users}
                personColors={personColors}
                onEventClick={openEvent}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3">
            {loading ? (
              <PageLoading title={d.calendar.loading} lines={2} />
            ) : loadError ? (
              <Card>
                <CardContent className="space-y-3 p-6">
                  <p role="alert" className="text-sm text-destructive">{loadError}</p>
                  <Button size="sm" variant="outline" onClick={() => setReloadKey((n) => n + 1)}>
                    {d.common.retry}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <CalendarView
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Bell className="h-4 w-4" />
                {d.calendar.upcomingReminders}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcoming.map((e) => (
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
                  description="กดเพิ่มนัด หรือคลิกวันที่ในปฏิทินเพื่อวางนัดใหม่"
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}

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
            <div className="mt-5 flex justify-end gap-2">
              {user?.id === selectedLeave.leaveOwnerId && selectedLeave.leaveId && token && (
                <Button variant="destructive" size="sm" onClick={async () => {
                  if (!window.confirm('ยกเลิกรายการลานี้?')) return;
                  try { await api.cancelLeave(token, selectedLeave.leaveId!); }
                  catch (error) {
                    setLeaveError(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ กรุณาลองใหม่');
                    return;
                  }
                  setSelectedLeave(null);
                  void loadEvents().catch((error) => setLoadError(error instanceof Error ? error.message : d.common.loadFailed));
                }}>ยกเลิกทั้งช่วงลา</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setSelectedLeave(null)}>ปิด</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
