'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, TravelResult, UserItem } from '@/lib/api';
import { CalendarView, CalendarEventData } from '@/components/CalendarView';
import { TravelPreviewCard } from '@/components/TravelPreviewCard';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const EVENT_COLORS: Record<string, string> = {
  COURT_DATE: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  CLIENT_MEETING: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  DEADLINE: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  OTHER: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export default function CourtSchedulePage() {
  const d = useDashboardT();
  const EVENT_TYPE_LABELS: Record<string, string> = {
    COURT_DATE: d.calendar.typeCourtDate,
    CLIENT_MEETING: d.calendar.typeClientMeeting,
    DEADLINE: d.calendar.typeDeadline,
    OTHER: d.calendar.typeOther,
  };
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [month, setMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'view' | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventData | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [form, setForm] = useState({
    caseId: '', title: '', description: '', courtName: '', startAt: '', type: 'COURT_DATE' as string,
    assigneeId: '',
  });
  const [users, setUsers] = useState<UserItem[]>([]);
  const [travelPreview, setTravelPreview] = useState<TravelResult | null>(null);

  useEffect(() => {
    if (!token) return;
    // Lawyers only: the picker names who is attending a hearing.
    api.getLawyers(token).then(setUsers).catch(console.error);
  }, [token]);

  const loadEvents = useCallback(() => {
    if (!token) return;
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    api.getCalendarEvents(token, { from, to }).then(setEvents).catch(console.error);
  }, [token, month]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([loadEvents(), api.getCases(token).then(setCases)]).finally(() => setLoading(false));
  }, [token, loadEvents]);

  const upcoming = events
    .filter((e) => new Date(e.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);

  const openCreate = (date: Date) => {
    setSelectedDate(date);
    const d = new Date(date);
    d.setHours(9, 0, 0, 0);
    setForm({
      caseId: cases[0]?.id ?? '', title: '', description: '',
      courtName: cases[0]?.courtName ?? '', startAt: d.toISOString().slice(0, 16), type: 'COURT_DATE',
      assigneeId: '',
    });
    setTravelPreview(null);
    setModal('create');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    await api.createCalendarEvent(token, {
      ...form,
      // An empty pick means "nobody named", which the API reads as the lead lawyer.
      assigneeId: form.assigneeId || undefined,
      startAt: new Date(form.startAt).toISOString(),
    });
    if (form.type === 'COURT_DATE' && form.courtName) {
      setTravelPreview(await api.calculateTravel(token, form.courtName));
    } else {
      setModal(null);
      loadEvents();
    }
  };

  return (
    <div>
      <PageHeader
        title={d.calendar.title}
        description={d.calendar.description}
        actions={
          <Button size="sm" onClick={() => openCreate(new Date())}>
            <Plus className="h-4 w-4" />{d.calendar.addEvent}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {loading ? (
            <p className="text-muted-foreground">{d.calendar.loading}</p>
          ) : (
            <Card>
              <CardContent className="p-4">
                <CalendarView
                  events={events}
                  month={month}
                  onMonthChange={setMonth}
                  onDayClick={openCreate}
                  onEventClick={(ev) => { setSelectedEvent(ev); setModal('view'); }}
                />
              </CardContent>
            </Card>
          )}
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
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
              <Bell className="h-4 w-4" />{d.calendar.upcomingReminders}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{e.title}</p>
                  <Badge className={EVENT_COLORS[e.type] ?? EVENT_COLORS.OTHER} variant="outline">
                    {EVENT_TYPE_LABELS[e.type] ?? EVENT_TYPE_LABELS.OTHER}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(e.startAt)}</p>
                {e.case && <p className="text-xs text-primary">{e.case.ownRef}</p>}
              </div>
            ))}
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">{d.calendar.noUpcoming}</p>}
          </CardContent>
        </Card>
      </div>

      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={handleCreate} className="w-full max-w-md rounded-xl border bg-card p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold">{d.calendar.newEvent} {selectedDate && `— ${formatDateTime(selectedDate.toISOString())}`}</h2>
            <div className="space-y-3">
              <select required value={form.caseId} onChange={(e) => {
                const c = cases.find((x) => x.id === e.target.value);
                setForm({ ...form, caseId: e.target.value, courtName: c?.courtName ?? form.courtName });
              }} className="w-full h-9 rounded-lg border border-input bg-card px-3 text-sm">
                <option value="">{d.calendar.selectCase}</option>
                {cases.map((c) => <option key={c.id} value={c.id}>{c.ownRef} — {c.title}</option>)}
              </select>
              <Input required placeholder={d.calendar.eventTitle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full h-9 rounded-lg border border-input bg-card px-3 text-sm">
                <option value="COURT_DATE">{d.calendar.typeCourtDate}</option>
                <option value="CLIENT_MEETING">{d.calendar.typeClientMeeting}</option>
                <option value="DEADLINE">{d.calendar.typeDeadline}</option>
                <option value="OTHER">{d.calendar.typeOther}</option>
              </select>
              {form.type === 'COURT_DATE' && (
                <Input placeholder={d.calendar.courtName} value={form.courtName} onChange={(e) => setForm({ ...form, courtName: e.target.value })} />
              )}
              <Input required type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
              <div>
                <select
                  aria-label={d.calendar.assignee}
                  value={form.assigneeId}
                  onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
                  className="w-full h-9 rounded-lg border border-input bg-card px-3 text-sm"
                >
                  <option value="">{d.calendar.assigneeLead}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{d.calendar.assigneeHint}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="submit">{d.common.create}</Button>
              <Button type="button" variant="outline" onClick={() => setModal(null)}>{d.common.cancel}</Button>
            </div>
          </form>
        </div>
      )}

      {travelPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-card">
            <h2 className="mb-4 text-lg font-semibold">{d.calendar.courtDateCreated}</h2>
            <TravelPreviewCard travel={travelPreview} />
            <Button className="mt-4 w-full" onClick={() => { setTravelPreview(null); setModal(null); loadEvents(); }}>{d.common.done}</Button>
          </div>
        </div>
      )}

      {modal === 'view' && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-card">
            <h2 className="text-lg font-semibold">{selectedEvent.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{formatDateTime(selectedEvent.startAt)}</p>
            <Badge className="mt-2">{EVENT_TYPE_LABELS[selectedEvent.type] ?? EVENT_TYPE_LABELS.OTHER}</Badge>
            {selectedEvent.case && <p className="mt-2 text-sm">{d.calendar.caseLabel}: {selectedEvent.case.ownRef}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="destructive" size="sm" onClick={async () => {
                if (!token || !selectedEvent) return;
                if (!confirm(d.calendar.deleteConfirm)) return;
                await api.deleteCalendarEvent(token, selectedEvent.id);
                setModal(null); loadEvents();
              }}>{d.common.delete}</Button>
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>{d.common.close}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
