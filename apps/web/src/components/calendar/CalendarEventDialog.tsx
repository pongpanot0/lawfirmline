'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { api, CalendarEventItem, CaseItem, TravelResult, UserItem } from '@/lib/api';
import { bangkokInputToIso, bangkokInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/misc';
import { TravelPreviewCard } from '@/components/TravelPreviewCard';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const SELECT_CLASS = 'w-full h-9 rounded-lg border border-input bg-card px-3 text-sm';

interface CalendarEventDialogProps {
  /** Fixed case for a dialog opened from inside a case — no picker is shown. */
  caseId?: string;
  /** The court that case sits in, so a court date fills it in already. */
  caseCourtName?: string | null;
  /** Cases to choose between when the dialog is opened outside a case. */
  cases?: CaseItem[];
  /** Lawyers who can be named as attending. */
  users?: UserItem[];
  /** The event being edited; absent means a new one. */
  event?: CalendarEventItem | null;
  /** The day a new event starts on. Its time defaults to 09:00 Bangkok. */
  defaultDate?: Date;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One dialog for adding, reading and editing an event, shared by the firm
 * calendar and a case's own calendar so a lawyer meets the same form either
 * way — and, inside a case, never has to pick that case again.
 *
 * Times are entered and shown on the Bangkok wall clock: a hearing is at the
 * time the court will call it, whatever zone the lawyer's laptop is set to.
 */
export function CalendarEventDialog({
  caseId,
  caseCourtName,
  cases,
  users = [],
  event,
  defaultDate,
  onClose,
  onSaved,
}: CalendarEventDialogProps) {
  const d = useDashboardT();
  const { token } = useAuth();

  const [form, setForm] = useState(() => initialForm(event, caseId, caseCourtName, defaultDate));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [travelPreview, setTravelPreview] = useState<TravelResult | null>(null);
  /**
   * Set once the event exists. A retry after a partial failure then edits that
   * event instead of adding a second one to the calendar.
   */
  const [savedId, setSavedId] = useState<string | null>(event?.id ?? null);
  /**
   * An existing event opens read-only: most clicks on a hearing are to see
   * when and where, not to change it. Editing is one deliberate step away,
   * and the delete button only appears there.
   */
  const [mode, setMode] = useState<'view' | 'edit'>(event ? 'view' : 'edit');

  useEffect(() => {
    setForm(initialForm(event, caseId, caseCourtName, defaultDate));
    setSavedId(event?.id ?? null);
    setMode(event ? 'view' : 'edit');
    setError('');
    setTravelPreview(null);
  }, [event, caseId, caseCourtName, defaultDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || saving) return;
    setSaving(true);
    setError('');

    const payload = {
      title: form.title,
      description: form.description || undefined,
      courtName: form.type === 'COURT_DATE' ? form.courtName || undefined : undefined,
      startAt: bangkokInputToIso(form.startAt),
      type: form.type,
      // No pick means "nobody named", which the API reads as the lead lawyer.
      assigneeId: form.assigneeId || undefined,
    };

    try {
      if (savedId) {
        await api.updateCalendarEvent(token, savedId, payload);
        onSaved();
        onClose();
        return;
      }

      const created = await api.createCalendarEvent(token, { ...payload, caseId: form.caseId });
      setSavedId(created.id);
      onSaved();

      if (form.type === 'COURT_DATE' && form.courtName) {
        // The estimate is a courtesy; losing it must not lose the court date.
        try {
          setTravelPreview(await api.calculateTravel(token, form.courtName));
          return;
        } catch {
          setError(d.calendar.travelFailed);
          return;
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.calendar.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !savedId) return;
    if (!confirm(d.calendar.deleteConfirm)) return;
    setDeleting(true);
    setError('');
    try {
      await api.deleteCalendarEvent(token, savedId);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : d.calendar.deleteFailed);
    } finally {
      setDeleting(false);
    }
  };

  if (travelPreview) {
    return (
      <Modal open onClose={onClose}>
        <h2 className="mb-4 text-lg font-semibold">{d.calendar.courtDateCreated}</h2>
        <TravelPreviewCard travel={travelPreview} />
        <Button className="mt-4 w-full" onClick={onClose}>
          {d.common.done}
        </Button>
      </Modal>
    );
  }

  const selectedCase = cases?.find((c) => c.id === form.caseId);

  if (event && mode === 'view') {
    const typeLabels: Record<string, string> = {
      COURT_DATE: d.calendar.typeCourtDate,
      CLIENT_MEETING: d.calendar.typeClientMeeting,
      DEADLINE: d.calendar.typeDeadline,
      OTHER: d.calendar.typeOther,
    };
    const assignee = users.find((u) => u.id === event.assigneeId);
    const courtName = event.type === 'COURT_DATE' ? event.courtName || event.case?.courtName : null;
    const rows: { label: string; value: React.ReactNode }[] = [
      { label: d.calendar.eventType, value: typeLabels[event.type] ?? event.type },
      { label: d.calendar.timeHint, value: formatDateTime(event.startAt) },
      ...(courtName ? [{ label: d.calendar.courtName, value: courtName }] : []),
      ...(event.case
        ? [{
            label: d.calendar.caseLabel,
            value: (
              <Link href={`/cases/${event.case.id}`} className="text-primary hover:underline">
                {event.case.ownRef} — {event.case.title}
              </Link>
            ),
          }]
        : []),
      {
        label: d.calendar.assignee,
        value: assignee ? `${assignee.firstName} ${assignee.lastName}` : d.calendar.assigneeLead,
      },
      ...(event.description ? [{ label: d.calendar.eventDescription, value: event.description }] : []),
    ];
    return (
      <Modal open onClose={onClose}>
        <h2 className="mb-1 text-lg font-semibold">{event.title}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{d.calendar.eventDetails}</p>
        <dl className="space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 flex-1">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => setMode('edit')}>{d.common.edit}</Button>
          <Button type="button" variant="outline" onClick={onClose}>{d.common.close}</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 className="mb-4 text-lg font-semibold">
          {savedId ? d.calendar.editEvent : d.calendar.newEvent}
        </h2>

        <div className="space-y-3">
          {caseId ? (
            <p className="text-xs text-muted-foreground">{d.calendar.caseFixed}</p>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{d.calendar.caseLabel}</span>
              <select
                required
                value={form.caseId}
                disabled={!!savedId}
                onChange={(e) => {
                  const next = cases?.find((c) => c.id === e.target.value);
                  setForm({
                    ...form,
                    caseId: e.target.value,
                    // Fill the court from the case only while it is still blank,
                    // so a hand-typed venue is never silently replaced.
                    courtName: form.courtName || next?.courtName || '',
                  });
                }}
                className={SELECT_CLASS}
              >
                <option value="">{d.calendar.selectCase}</option>
                {cases?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ownRef} — {c.title}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.eventTitle}</span>
            <Input
              required
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.eventType}</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="COURT_DATE">{d.calendar.typeCourtDate}</option>
              <option value="CLIENT_MEETING">{d.calendar.typeClientMeeting}</option>
              <option value="DEADLINE">{d.calendar.typeDeadline}</option>
              <option value="OTHER">{d.calendar.typeOther}</option>
            </select>
          </label>

          {form.type === 'COURT_DATE' && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{d.calendar.courtName}</span>
              <Input
                value={form.courtName}
                onChange={(e) => setForm({ ...form, courtName: e.target.value })}
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.timeHint}</span>
            <Input
              required
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.assignee}</span>
            <select
              value={form.assigneeId}
              onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">{d.calendar.assigneeLead}</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              {d.calendar.assigneeHint}
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.eventDescription}</span>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          {selectedCase && !caseId && (
            <p className="text-xs text-muted-foreground">
              {selectedCase.ownRef} — {selectedCase.title}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? d.calendar.saving : d.common.save}
          </Button>
          <Button type="button" variant="outline" onClick={() => (event ? setMode('view') : onClose())}>
            {event ? d.common.cancel : d.common.close}
          </Button>
          {savedId && (
            <Button
              type="button"
              variant="destructive"
              className="ms-auto"
              disabled={deleting}
              onClick={handleDelete}
            >
              {d.common.delete}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

function initialForm(
  event: CalendarEventItem | null | undefined,
  caseId: string | undefined,
  caseCourtName: string | null | undefined,
  defaultDate: Date | undefined,
) {
  if (event) {
    return {
      caseId: event.case?.id ?? caseId ?? '',
      title: event.title,
      description: event.description ?? '',
      courtName: event.courtName ?? event.case?.courtName ?? '',
      startAt: bangkokInputValue(event.startAt),
      type: event.type,
      assigneeId: event.assigneeId ?? '',
    };
  }

  // 09:00 Bangkok on the chosen day: the hour a hearing list is called.
  const day = bangkokInputValue(defaultDate ?? new Date()).slice(0, 10);
  return {
    caseId: caseId ?? '',
    title: '',
    description: '',
    courtName: caseCourtName ?? '',
    startAt: `${day}T09:00`,
    type: 'COURT_DATE',
    assigneeId: '',
  };
}
