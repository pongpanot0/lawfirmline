'use client';

import { COURT_EVENT_KIND_LABELS, CourtEventKind } from '@lawfirm/shared';
import { EventResponsibility } from './EventResponsibility';
import { OutlookChangesPanel } from './OutlookChangesPanel';
import { AvailabilityPanel } from './AvailabilityPanel';
import { DURATION_OPTIONS, DEFAULT_DURATION, closestDuration } from '@/lib/availability';
import { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import { api, CalendarEventItem, CaseListItem, TravelResult, UserItem } from '@/lib/api';
import { bangkokInputToIso, bangkokInputValue } from '@/lib/bangkok';
import { useLeaveFlags } from '@/lib/use-leave-flags';
import { leaveWarning } from '@/lib/leave-flags';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThaiDateTimeInput } from '@/components/ui/ThaiDateTimeInput';
import { Modal } from '@/components/ui/misc';
import { TravelPreviewCard } from '@/components/TravelPreviewCard';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELECT_CLASS ='w-full h-9 rounded-lg border border-input bg-card px-3 text-sm';

interface CalendarEventDialogProps {
  /** Fixed case for a dialog opened from inside a case — no picker is shown. */
  caseId?: string;
  /** The court that case sits in, so a court date fills it in already. */
  caseCourtName?: string | null;
  /** Cases to choose between when the dialog is opened outside a case. */
  cases?: CaseListItem[];
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
  const { token, user } = useAuth();

  const [form, setForm] = useState(() =>
    initialForm(event, caseId, caseCourtName, defaultDate, user?.id),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [inviteDraft, setInviteDraft] = useState('');
  const [contactEmails, setContactEmails] = useState<string[]>([]);
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

  // form.startAt is already a Bangkok wall-clock value (see bangkokInputValue),
  // so its date portion is the Bangkok calendar day without further conversion.
  const eventDate = form.startAt.slice(0, 10);
  const leaveFlags = useLeaveFlags(token, eventDate);

  const [availOpen, setAvailOpen] = useState(form.type === 'CLIENT_MEETING');
  // An existing event keeps its own end unless the user picks a new duration (no silent snapping).
  const [durationTouched, setDurationTouched] = useState(false);
  useEffect(() => {
    if (form.type === 'CLIENT_MEETING') setAvailOpen(true);
  }, [form.type]);
  const hasDuration = form.type !== 'DEADLINE';
  // Whoever is named, else the case's lead lawyer, plus me.
  const leadId = cases?.find((c) => c.id === form.caseId)?.leadLawyerId ?? event?.case?.leadLawyer?.id;
  const availIds = [...new Set([...(form.assigneeIds.length ? form.assigneeIds : leadId ? [leadId] : []), ...(user?.id ? [user.id] : [])])];

  const toggleAssignee = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(userId)
        ? prev.assigneeIds.filter((id) => id !== userId)
        : [...prev.assigneeIds, userId],
    }));
  };

  // Offer the client's contact emails as one-tap invitees once Teams is ticked.
  useEffect(() => {
    if (!token || !form.onlineMeeting || !form.caseId) return;
    let cancelled = false;
    api
      .getCase(token, form.caseId)
      .then((c) => {
        if (cancelled) return;
        const emails = (c.client?.contacts ?? [])
          .map((x) => x.email?.trim().toLowerCase())
          .filter((x): x is string => !!x);
        setContactEmails([...new Set(emails)]);
      })
      .catch(() => {
        if (!cancelled) setContactEmails([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, form.onlineMeeting, form.caseId]);

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
    // A typed-but-not-added invitee is added on submit rather than silently dropped.
    const pendingInvite = inviteDraft.trim().toLowerCase();
    let inviteeEmails = form.inviteeEmails;
    if (form.type === 'CLIENT_MEETING' && form.onlineMeeting && pendingInvite) {
      if (!EMAIL_PATTERN.test(pendingInvite)) {
        setError('อีเมลผู้รับเชิญไม่ถูกต้อง — แก้ไขหรือลบก่อนบันทึก');
        return;
      }
      if (!inviteeEmails.includes(pendingInvite)) inviteeEmails = [...inviteeEmails, pendingInvite];
      setInviteDraft('');
    }
    setSaving(true);
    setError('');

    const payload = {
      title: form.title,
      description: form.description || undefined,
      courtName: form.type === 'COURT_DATE' ? form.courtName || undefined : undefined,
      startAt: bangkokInputToIso(form.startAt),
      endAt: hasDuration && (!savedId || durationTouched)
        ? new Date(new Date(bangkokInputToIso(form.startAt)).getTime() + form.durationMin * 60000).toISOString()
        : undefined,
      type: form.type,
      courtEventKind: form.type === 'COURT_DATE' ? form.courtEventKind || null : null,
      // An empty list means "nobody named", which the API reads as the lead lawyer.
      assigneeIds: form.assigneeIds,
      onlineMeeting: form.type === 'CLIENT_MEETING' ? form.onlineMeeting : false,
      inviteeEmails: form.type === 'CLIENT_MEETING' && form.onlineMeeting ? inviteeEmails : [],
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
    if (!confirm(form.title ? `${d.common.delete} “${form.title}”?` : d.calendar.deleteConfirm)) return;
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
    // Prefer the API's embedded names; fall back to the roster lookup, then
    // to the legacy single assigneeId when the event carries no rows at all.
    const assigneeNames = event.assignees?.length
      ? event.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`)
      : (() => {
          const single = users.find((u) => u.id === event.assigneeId);
          return single ? [`${single.firstName} ${single.lastName}`] : [];
        })();
    const courtName = event.type === 'COURT_DATE' ? event.courtName || event.case?.courtName : null;
    const rows: { label: string; value: React.ReactNode }[] = [
      { label: d.calendar.eventType, value: typeLabels[event.type] ?? event.type },
      ...(event.type === 'COURT_DATE' && event.courtEventKind ? [{ label: d.calendar.courtEventKind, value: COURT_EVENT_KIND_LABELS[event.courtEventKind] }] : []),
      {
        label: d.calendar.timeHint,
        value: (
          <>
            {formatDateTime(event.startAt)}
            {(event.type === 'CLIENT_MEETING' || event.type === 'OTHER') && <p className="text-xs text-muted-foreground">ย้ายเวลาใน Outlook ได้ ระบบจะอัปเดตตาม</p>}
            {(event.type === 'COURT_DATE' || event.type === 'DEADLINE') && <p className="text-xs text-muted-foreground">ถ้าย้ายใน Outlook ระบบจะถามยืนยันก่อน</p>}
          </>
        ),
      },
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
        value: assigneeNames.length ? assigneeNames.join(', ') : d.calendar.assigneeLead,
      },
      ...(event.description ? [{ label: d.calendar.eventDescription, value: event.description }] : []),
    ];
    return (
      <Modal open onClose={onClose}>
        <h2 className="mb-1 text-lg font-semibold">{event.title}</h2>
        <p className="mb-4 text-xs text-muted-foreground">{d.calendar.eventDetails}</p>
        {event.onlineMeetingUrl?.startsWith('https://') && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <a
              href={event.onlineMeetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: 'sm' })}
            >
              เข้าร่วม Teams
            </a>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={() => navigator.clipboard.writeText(event.onlineMeetingUrl!)}
            >
              คัดลอกลิงก์
            </Button>
          </div>
        )}
        {event.onlineMeeting && !event.onlineMeetingUrl?.startsWith('https://') && (
          <p className="mb-3 text-xs text-muted-foreground">กำลังสร้างลิงก์ Teams… (ภายใน 2 นาที)</p>
        )}
        <OutlookChangesPanel eventId={event.id} onChanged={onSaved} />
        <dl className="space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-3">
              <dt className="w-28 shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 flex-1">{row.value}</dd>
            </div>
          ))}
        </dl>
        <EventResponsibility eventId={event.id} startAt={event.startAt} type={event.type} onChanged={onSaved} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant={event.onlineMeetingUrl?.startsWith('https://') ? 'outline' : 'default'} onClick={() => setMode('edit')}>{d.common.edit}</Button>
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
                  // Contact invitees belong to the previous case; typed ones stay.
                  setContactEmails([]);
                  setForm({
                    ...form,
                    inviteeEmails: form.inviteeEmails.filter((x) => !contactEmails.includes(x)),
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
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{d.calendar.courtName}</span>
                <Input
                  value={form.courtName}
                  onChange={(e) => setForm({ ...form, courtName: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{d.calendar.courtEventKind}</span>
                <select
                  value={form.courtEventKind}
                  onChange={(e) => setForm({ ...form, courtEventKind: e.target.value as CourtEventKind | '' })}
                  className={SELECT_CLASS}
                >
                  <option value="">{d.calendar.courtEventKindNone}</option>
                  {Object.values(CourtEventKind).map((kind) => (
                    <option key={kind} value={kind}>{COURT_EVENT_KIND_LABELS[kind]}</option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.timeHint}</span>
            <ThaiDateTimeInput
              required
              disabled={!!savedId}
              value={form.startAt}
              onChange={(v) => setForm({ ...form, startAt: v })}
              className="mt-1"
            />
          </label>

          {hasDuration && (
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">ระยะเวลา</span>
              <select
                value={form.durationMin}
                onChange={(e) => { setDurationTouched(true); setForm({ ...form, durationMin: Number(e.target.value) }); }}
                className={SELECT_CLASS}
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.minutes} value={o.minutes}>{o.label}</option>
                ))}
              </select>
            </label>
          )}

          {token && availIds.length > 0 && (
            <div className="text-sm">
              <button
                type="button"
                className="mb-1 flex min-h-11 w-full items-center justify-between text-muted-foreground"
                aria-expanded={availOpen}
                onClick={() => setAvailOpen((o) => !o)}
              >
                <span>เวลาว่างของทีม</span>
                {availOpen ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              </button>
              {availOpen && (
                <AvailabilityPanel
                  token={token}
                  date={eventDate}
                  startAt={form.startAt}
                  durationMin={form.durationMin}
                  userIds={availIds}
                  excludeEventId={savedId}
                  canPick={!savedId}
                  onPick={(day, time) => setForm((f) => ({ ...f, startAt: `${day}T${time}` }))}
                />
              )}
            </div>
          )}

          <div className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{d.calendar.assignee}</span>
            <div className="space-y-1 rounded-lg border border-input bg-card p-2">
              {users.map((u) => {
                const checked = form.assigneeIds.includes(u.id);
                const isPrimary = form.assigneeIds[0] === u.id;
                const flag = leaveFlags.get(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAssignee(u.id)}
                    />
                    <span className="flex-1">{u.firstName} {u.lastName}</span>
                    {isPrimary && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        หลัก
                      </span>
                    )}
                    {flag && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          flag.kind === 'ON_LEAVE'
                            ? 'bg-amber-100 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {flag.label}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <span className="mt-1 block text-xs text-muted-foreground">
              {d.calendar.assigneeHint}
            </span>
            {form.assigneeIds
              .filter((id) => leaveFlags.has(id))
              .map((id) => {
                const u = users.find((user) => user.id === id);
                if (!u) return null;
                return (
                  <p key={id} className="mt-1 flex items-start gap-1 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {leaveWarning(`${u.firstName} ${u.lastName}`, eventDate, leaveFlags.get(id)?.kind)}
                  </p>
                );
              })}
          </div>

          {form.type === 'CLIENT_MEETING' && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.onlineMeeting}
                  onChange={(e) => setForm((f) => ({ ...f, onlineMeeting: e.target.checked }))}
                />
                ประชุมออนไลน์ (Microsoft Teams)
              </label>
              {form.onlineMeeting && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    ระบบสร้างลิงก์ Teams ในปฏิทิน Outlook ของผู้จัด และ Outlook จะส่งคำเชิญถึงอีเมลด้านล่าง
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {contactEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className={`rounded-full border px-2 py-0.5 text-xs ${form.inviteeEmails.includes(email) ? 'bg-primary text-primary-foreground' : ''}`}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            inviteeEmails: f.inviteeEmails.includes(email)
                              ? f.inviteeEmails.filter((x) => x !== email)
                              : [...f.inviteeEmails, email],
                          }))
                        }
                      >
                        {email}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="เพิ่มอีเมลผู้รับเชิญ แล้วกด Enter"
                    value={inviteDraft}
                    onChange={(e) => setInviteDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      const email = inviteDraft.trim().toLowerCase();
                      if (EMAIL_PATTERN.test(email) && !form.inviteeEmails.includes(email)) {
                        setForm((f) => ({ ...f, inviteeEmails: [...f.inviteeEmails, email] }));
                        setInviteDraft('');
                      }
                    }}
                  />
                  {form.inviteeEmails
                    .filter((x) => !contactEmails.includes(x))
                    .map((email) => (
                      <span
                        key={email}
                        className="mr-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                      >
                        {email}
                        <button
                          type="button"
                          aria-label={`ลบ ${email}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:text-destructive"
                          onClick={() =>
                            setForm((f) => ({ ...f, inviteeEmails: f.inviteeEmails.filter((x) => x !== email) }))
                          }
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </>
          )}

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
            {saving ? d.calendar.saving : event ? d.common.save : d.calendar.addEvent}
          </Button>
          <Button type="button" variant="outline" onClick={() => (event ? setMode('view') : onClose())}>
            {event ? d.common.cancel : d.common.close}
          </Button>
          {savedId && (
            <Button
              type="button"
              variant="outline"
              className="ms-auto border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
  currentUserId?: string,
) {
  if (event) {
    // Row order from the API is unreliable — put the primary person first,
    // then the rest, falling back to the legacy single assigneeId.
    const rest = (event.assignees ?? [])
      .map((a) => a.userId)
      .filter((id) => id !== event.assigneeId);
    const assigneeIds = event.assigneeId ? [event.assigneeId, ...rest] : rest;
    return {
      caseId: event.case?.id ?? caseId ?? '',
      title: event.title,
      description: event.description ?? '',
      courtName: event.courtName ?? event.case?.courtName ?? '',
      startAt: bangkokInputValue(event.startAt),
      durationMin: closestDuration(event.startAt, event.endAt),
      type: event.type,
      courtEventKind: (event.courtEventKind ?? '') as CourtEventKind | '',
      assigneeIds,
      onlineMeeting: event.onlineMeeting ?? false,
      inviteeEmails: event.inviteeEmails ?? [],
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
    durationMin: DEFAULT_DURATION,
    type: 'COURT_DATE',
    courtEventKind: '' as CourtEventKind | '',
    // คนสร้างนัดมักสร้างให้ตัวเอง — ตั้งตัวเองเป็นผู้รับผิดชอบไว้ก่อน เปลี่ยนได้
    assigneeIds: currentUserId ? [currentUserId] : [],
    onlineMeeting: false,
    inviteeEmails: [] as string[],
  };
}
