'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { DeadlineTrigger } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, UserItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { CaseTimelineView } from '@/components/cases/CaseTimelineView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { PageLoading } from '@/components/ui/misc';

/**
 * A court date starts its own deadlines when the event is created, but a
 * judgment being read, an order arriving or a complaint being served leaves no
 * calendar entry — so those clocks have to be started by hand.
 */
const MANUAL_TRIGGERS = [
  DeadlineTrigger.JUDGMENT,
  DeadlineTrigger.ORDER_RECEIVED,
  DeadlineTrigger.COMPLAINT_SERVED,
];

export function CaseCalendarPanel({ caseId }: { caseId: string }) {
  const d = useDashboardT();
  const requestedEvent = useSearchParams().get('eventId');
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [legalCase, setLegalCase] = useState<CaseItem | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [month, setMonth] = useState(new Date());
  const [view, setView] = useState<'timeline' | 'calendar'>('timeline');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<
    { event: CalendarEventItem | null; defaultDate?: Date } | null
  >(null);

  const [trigger, setTrigger] = useState<DeadlineTrigger>(DeadlineTrigger.JUDGMENT);
  const [triggerDate, setTriggerDate] = useState('');
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [suggestionsKey, setSuggestionsKey] = useState(0);

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
      .finally(() => setLoading(false));
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
        trigger,
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

  if (loading) return <PageLoading title={d.calendar.loading} lines={3} />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <div>
          <h2 className="font-semibold tracking-tight text-foreground">{d.caseCalendar.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">นัด เหตุการณ์ และกำหนดติดตามในมุมมองเดียว</p>
        </div>
        <div className="flex items-center gap-2">
        <div role="group" aria-label={d.caseCalendar.title} className="flex rounded-md border border-border p-0.5">
          {(['timeline', 'calendar'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={
                view === v
                  ? 'rounded px-3 py-1 text-sm font-semibold bg-primary text-primary-foreground'
                  : 'rounded px-3 py-1 text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {v === 'timeline' ? d.caseCalendar.viewTimeline : d.caseCalendar.viewCalendar}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setDialog({ event: null, defaultDate: new Date() })}>
          <Plus className="h-4 w-4" />
          {d.calendar.addEventForCase}
        </Button>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-xl border bg-card p-6 shadow-soft">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setReloadKey((n) => n + 1)}>
            {d.common.retry}
          </Button>
        </div>
      ) : view === 'timeline' ? (
        <CaseTimelineView events={events} onEventClick={(event) => setDialog({ event })} />
      ) : (
        <CalendarView
          events={events}
          month={month}
          onMonthChange={setMonth}
          onDayClick={(date) => setDialog({ event: null, defaultDate: date })}
          onEventClick={(ev) => setDialog({ event: events.find((e) => e.id === ev.id) ?? null })}
        />
      )}

      <details className="mt-4 rounded-xl border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{d.dateSuggestions.applyTrigger}</summary>
        <div className="pt-3">
        <p className="mb-3 mt-1 text-sm text-muted-foreground">{d.dateSuggestions.applyTriggerHint}</p>

        <form onSubmit={handleApply} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{d.deadlineRules.trigger}</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as DeadlineTrigger)}
            >
              {MANUAL_TRIGGERS.map((value) => (
                <option key={value} value={value}>
                  {d.deadlineRules.triggers[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">
              {d.dateSuggestions.applyTriggerDate}
            </span>
            <ThaiDateInput
              required
              value={triggerDate}
              onChange={setTriggerDate}
            />
          </label>

          <Button type="submit" size="sm" disabled={applying}>
            {d.dateSuggestions.applyTrigger}
          </Button>
        </form>

        {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </details>

      <DateSuggestionsPanel
        caseId={caseId}
        source="RULE"
        title={d.dateSuggestions.ruleTitle}
        reloadKey={suggestionsKey}
      />

      {dialog && (
        <CalendarEventDialog
          caseId={caseId}
          caseCourtName={legalCase?.courtName}
          users={users}
          event={dialog.event}
          defaultDate={dialog.defaultDate}
          onClose={() => setDialog(null)}
          onSaved={() => setReloadKey((n) => n + 1)}
        />
      )}
    </div>
  );
}
