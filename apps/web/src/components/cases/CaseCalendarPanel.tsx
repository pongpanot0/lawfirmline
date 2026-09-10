'use client';

import { useEffect, useState } from 'react';
import { Gavel, Plus } from 'lucide-react';
import { DeadlineTrigger } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem, CaseItem, UserItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { CalendarEventDialog } from '@/components/calendar/CalendarEventDialog';
import { DateSuggestionsPanel } from '@/components/cases/DateSuggestionsPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [legalCase, setLegalCase] = useState<CaseItem | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [month, setMonth] = useState(new Date());
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
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    setLoading(true);
    setLoadError('');
    api
      .getCalendarEvents(token, { from, to })
      .then((all) => {
        setEvents(all.filter((e) => e.case?.id === caseId));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.common.loadFailed))
      .finally(() => setLoading(false));
  }, [token, caseId, month, reloadKey, d.common.loadFailed]);

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight text-foreground">{d.caseCalendar.title}</h2>
        <Button size="sm" onClick={() => setDialog({ event: null, defaultDate: new Date() })}>
          <Plus className="h-4 w-4" />
          {d.calendar.addEventForCase}
        </Button>
      </div>

      <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Gavel className="size-4 text-muted-foreground" aria-hidden />
          {d.dateSuggestions.applyTrigger}
        </h3>
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
            <Input
              type="date"
              required
              value={triggerDate}
              onChange={(e) => setTriggerDate(e.target.value)}
            />
          </label>

          <Button type="submit" size="sm" disabled={applying}>
            {d.dateSuggestions.applyTrigger}
          </Button>
        </form>

        {notice && <p className="mt-3 text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      <DateSuggestionsPanel
        caseId={caseId}
        source="RULE"
        title={d.dateSuggestions.ruleTitle}
        reloadKey={suggestionsKey}
      />

      {loadError ? (
        <div className="rounded-xl border bg-card p-6 shadow-soft">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => setReloadKey((n) => n + 1)}
          >
            {d.common.retry}
          </Button>
        </div>
      ) : (
        <CalendarView
          events={events}
          month={month}
          onMonthChange={setMonth}
          onDayClick={(date) => setDialog({ event: null, defaultDate: date })}
          onEventClick={(ev) => setDialog({ event: events.find((e) => e.id === ev.id) ?? null })}
        />
      )}

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
