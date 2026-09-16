'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, UserItem, PublicHolidayItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { MyDayPanel } from '@/components/agenda/MyDayPanel';
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
};

/**
 * One calendar workspace behind /my-day and /court-schedule: the same page
 * with two views — "วันของฉัน" (your today/tomorrow agenda) and the firm's
 * month calendar. The route only picks which view opens first.
 */
export function CalendarWorkspace({ defaultView }: { defaultView: 'day' | 'month' }) {
  const d = useDashboardT();
  const EVENT_TYPE_LABELS: Record<string, string> = {
    COURT_DATE: d.calendar.typeCourtDate,
    CLIENT_MEETING: d.calendar.typeClientMeeting,
    DEADLINE: d.calendar.typeDeadline,
    OTHER: d.calendar.typeOther,
  };
  const { token } = useAuth();
  const [view, setView] = useState<'day' | 'month'>(defaultView);
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

  useEffect(() => {
    if (!token) return;
    // Lawyers only: the picker names who is attending a hearing.
    api.getLawyers(token).then(setUsers).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token || view !== 'month') return;
    api.getPublicHolidays(token, month.getFullYear()).then(setHolidays).catch(() => setHolidays([]));
  }, [token, view, month]);

  const loadEvents = useCallback(async () => {
    if (!token) return;
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    setEvents(await api.getCalendarEvents(token, { from, to }));
  }, [token, month]);

  useEffect(() => {
    if (!token || view !== 'month') return;
    setLoading(true);
    setLoadError('');
    Promise.all([loadEvents(), api.getCases(token).then(setCases)])
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.common.loadFailed))
      .finally(() => setLoading(false));
  }, [token, view, loadEvents, reloadKey, d.common.loadFailed]);

  // "รายคน": events carry assigneeId; ones with no explicit assignee follow the
  // case's lead lawyer, so they stay visible only under "ทุกคน".
  const visibleEvents = personFilter ? events.filter((e) => e.assigneeId === personFilter) : events;

  const upcoming = visibleEvents
    .filter((e) => new Date(e.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={view === 'day' ? d.myDay.title : d.calendar.title}
        description={view === 'day' ? d.myDay.description : d.calendar.description}
        actions={
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label={d.calendar.title} className="flex rounded-lg border border-border p-0.5">
              {(['day', 'month'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  type="button"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-xs ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                >
                  {v === 'day' ? d.myDay.title : d.calendar.title}
                </button>
              ))}
            </div>
            {view === 'month' && (
              <select
                aria-label="กรองตามผู้รับผิดชอบ"
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2 text-xs"
              >
                <option value="">ทุกคน</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            )}
            {view === 'month' && (
              <Button size="sm" onClick={() => setDialog({ event: null, defaultDate: new Date() })}>
                <Plus className="h-4 w-4" />
                {d.calendar.addEvent}
              </Button>
            )}
          </div>
        }
      />

      {view === 'day' ? (
        <MyDayPanel />
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
                    holidays={holidays}
                    month={month}
                    onMonthChange={setMonth}
                    onDayClick={(date) => setDialog({ event: null, defaultDate: date })}
                    onEventClick={(ev) =>
                      setDialog({ event: events.find((e) => e.id === ev.id) ?? null })
                    }
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
                <Bell className="h-4 w-4" />
                {d.calendar.upcomingReminders}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcoming.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setDialog({ event: e })}
                  className="w-full rounded-lg border border-border p-3 text-left hover:bg-accent/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{e.title}</p>
                    <Badge className={EVENT_COLORS[e.type] ?? EVENT_COLORS.OTHER} variant="outline">
                      {EVENT_TYPE_LABELS[e.type] ?? EVENT_TYPE_LABELS.OTHER}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(e.startAt)}</p>
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
    </div>
  );
}
