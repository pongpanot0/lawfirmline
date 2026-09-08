'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Bell } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, UserItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [users, setUsers] = useState<UserItem[]>([]);
  const [month, setMonth] = useState(new Date());
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

  const loadEvents = useCallback(async () => {
    if (!token) return;
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    setEvents(await api.getCalendarEvents(token, { from, to }));
  }, [token, month]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    Promise.all([loadEvents(), api.getCases(token).then(setCases)])
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.common.loadFailed))
      .finally(() => setLoading(false));
  }, [token, loadEvents, reloadKey, d.common.loadFailed]);

  const upcoming = events
    .filter((e) => new Date(e.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={d.calendar.title}
        description={d.calendar.description}
        actions={
          <Button size="sm" onClick={() => setDialog({ event: null, defaultDate: new Date() })}>
            <Plus className="h-4 w-4" />
            {d.calendar.addEvent}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {loading ? (
            <p className="text-muted-foreground">{d.calendar.loading}</p>
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
                  events={events}
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
              <p className="text-sm text-muted-foreground">{d.calendar.noUpcoming}</p>
            )}
          </CardContent>
        </Card>
      </div>

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
