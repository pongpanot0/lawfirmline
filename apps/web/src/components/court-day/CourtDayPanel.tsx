'use client';
import { prepareCourtOffline } from '@/lib/court-offline';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Trash2,
} from 'lucide-react';
import { EXPENSE_CATEGORIES, TaskStatus } from '@lawfirm/shared';
import { api, ApiError, DocumentItem, TaskItem } from '@/lib/api';
import { CourtDayResponse, CourtDayState, courtDayCopy } from '@/lib/court-day';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  bangkokInputToIso,
  bangkokInputValue,
  bangkokDateInputToIso,
  bangkokDateInputValue,
} from '@/lib/bangkok';
import { COURT_DRAFT_PREFIX, parseCourtDayDraft } from '@/lib/court-day-draft';
import { cn } from '@/lib/utils';

const inputClass =
  'min-h-11 min-w-0 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const linkClass =
  'inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CourtDayPanel({ eventId }: { eventId: string }) {
  const { token, user } = useAuth();
  const draftKey = user
    ? `${COURT_DRAFT_PREFIX}${user.firmId}:${user.id}:${eventId}`
    : null;
  const { locale } = useLocale();
  const t = courtDayCopy[locale];
  const [data, setData] = useState<CourtDayResponse | null>(null);
  const [state, setState] = useState<CourtDayState | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [stage, setStage] = useState(0);
  const [itemTitle, setItemTitle] = useState('');
  const [downloading, setDownloading] = useState('');
  const [offlineUrl, setOfflineUrl] = useState('');
  const [offlineBusy, setOfflineBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [draftCached, setDraftCached] = useState(false);
  const clearLocalDraft = () => {
    try {
      if (draftKey) sessionStorage.removeItem(draftKey);
    } catch {}
  };
  const lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.getCourtDay(token, eventId);
      const [caseTasks, caseDocuments] = await Promise.all([
        api.getTasks(token, response.event.caseId),
        api.getDocuments(token, response.event.caseId),
      ]);
      let pending = null;
      try {
        pending = draftKey
          ? parseCourtDayDraft(sessionStorage.getItem(draftKey))
          : null;
      } catch {}
      if (response.workspace.completedAt) pending = null;
      setData(response);
      setState(pending?.state ?? response.workspace.state);
      setTasks(caseTasks);
      setDocuments(caseDocuments);
      setDirty(!!pending);
      setRecovered(!!pending);
      setDraftCached(!!pending);
      setConflict(!!pending && pending.version !== response.workspace.version);
      if (pending && pending.version !== response.workspace.version)
        setError('CONFLICT');
    } catch {
      setError('LOAD_ERROR');
    } finally {
      setLoading(false);
    }
  }, [token, eventId, draftKey]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if ((!dirty || draftCached) && !busy) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, busy, draftCached]);
  useEffect(() => {
    if (!draftKey || !dirty || !state || !data || loading || conflict) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          version: data.workspace.version,
          savedAt: Date.now(),
          state,
        }),
      );
      setDraftCached(true);
    } catch {
      setDraftCached(false);
    }
  }, [draftKey, dirty, state, data, loading, conflict]);

  function edit(patch: Partial<CourtDayState>) {
    setState((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
    if (!conflict) setError('');
    setCopied(false);
  }
  function go(next: number) {
    setStage(next);
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      panel.current?.closest('main')?.scrollTo({ top: 0, behavior: 'instant' });
    });
  }
  function failure(err: unknown) {
    setConflict(err instanceof ApiError && err.status === 409);
    setError(
      err instanceof ApiError && err.status === 409
        ? t.conflict
        : err instanceof ApiError && err.status === 400
          ? err.message
          : t.error,
    );
  }
  async function save(next?: number) {
    if (!token || !state || !data || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const workspace =
        dirty || !data.workspace.updatedAt
          ? await api.saveCourtDay(
              token,
              eventId,
              data.workspace.version,
              state,
            )
          : data.workspace;
      setData({ ...data, workspace });
      setDirty(false);
      clearLocalDraft();
      setRecovered(false);
      if (next !== undefined) go(next);
    } catch (err) {
      failure(err);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function complete() {
    if (!token || !state || !data || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved =
        dirty || !data.workspace.updatedAt
          ? await api.saveCourtDay(
              token,
              eventId,
              data.workspace.version,
              state,
            )
          : data.workspace;
      setData({ ...data, workspace: saved });
      setDirty(false);
      clearLocalDraft();
      setRecovered(false);
      const workspace = await api.completeCourtDay(
        token,
        eventId,
        saved.version,
        data.event.updatedAt,
      );
      setData({ ...data, workspace });
      requestAnimationFrame(() => heading.current?.focus());
    } catch (err) {
      failure(err);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function download(doc: DocumentItem, version: number) {
    if (!token || !data || downloading) return;
    setDownloading(doc.id);
    setError('');
    try {
      const blob = await api.downloadDocument(
        token,
        data.event.caseId,
        doc.id,
        version,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        doc.versions?.find((v) => v.version === version)?.filename ??
        doc.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError(
        locale === 'th'
          ? 'ดาวน์โหลดไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่'
          : 'Download failed. Check your connection and retry.',
      );
    } finally {
      setDownloading('');
    }
  }
  async function copyEntries() {
    if (!state) return;
    try {
      await navigator.clipboard.writeText(
        [
          state.checklist
            .map((x) => `${x.done ? '✓' : '☐'} ${x.title}`)
            .join('\n'),
          state.notes,
          state.outcome,
          state.nextTitle,
          state.nextAt,
          state.taskTitle,
          state.taskDue,
          state.amount,
        ]
          .filter(Boolean)
          .join('\n\n'),
      );
      setCopied(true);
    } catch {
      setError(
        locale === 'th'
          ? 'คัดลอกไม่สำเร็จ กรุณาเลือกข้อความแล้วคัดลอก'
          : 'Copy failed. Select and copy the text manually.',
      );
    }
  }
  const canLeave = (e: React.MouseEvent) => {
    if (busy || (dirty && !draftCached && !window.confirm(t.leaveConfirm)))
      e.preventDefault();
  };

  if (loading)
    return (
      <p role="status" className="py-12 text-muted-foreground">
        {t.loading}
      </p>
    );
  if (!data || !state)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p role="alert">
          {error === 'LOAD_ERROR' ? t.loadError : error || t.loadError}
        </p>
        <Button onClick={load}>{t.retry}</Button>
        <Link className={linkClass} href="/my-day">
          {t.back}
        </Link>
      </div>
    );
  const { event, workspace } = data;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(value));
  const future = new Date(event.startAt).getTime() > Date.now();
  const valid =
    !!state.outcome.trim() &&
    (!state.nextHearing ||
      (!!state.nextTitle.trim() &&
        !!state.nextAt &&
        new Date(state.nextAt) > new Date(event.startAt))) &&
    (!state.followUp || !!state.taskTitle.trim()) &&
    (!state.expense ||
      (/^\d+(\.\d{1,2})?$/.test(state.amount) && Number(state.amount) > 0));
  const person = event.assignee ?? event.case.leadLawyer;
  const checked = state.checklist.filter((x) => x.done).length;
  const unavailableDocuments = state.documents.filter(
    (pin) => !documents.some((doc) => doc.id === pin.id),
  );
  const unavailableTasks = state.taskIds.filter(
    (id) => !tasks.some((task) => task.id === id),
  );
  const sectionTitle = [t.prep, t.outcome, t.review][stage];
  const result = workspace.result;

  return (
    <div
      ref={panel}
      className="mx-auto max-w-5xl space-y-5 pb-8"
      data-testid="court-day"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <Link href="/my-day" className={linkClass} onClick={canLeave}>
          <ArrowLeft className="size-4" />
          {t.back}
        </Link>
        <Link
          href={`/cases/${event.caseId}`}
          className={linkClass}
          onClick={canLeave}
        >
          {t.case}
        </Link>
      </div>
      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">
          {t.title} · {event.case.ownRef}
        </p>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {event.title}
        </h1>
        <p className="break-words text-sm text-muted-foreground">
          {event.case.title}
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <p className="font-medium">
            {date(event.startAt)}{' '}
            <span className="font-normal text-muted-foreground">
              · {t.timezone}
            </span>
          </p>
          <p>{event.courtName || event.case.courtName || '—'}</p>
          <p className="text-muted-foreground">
            {t.attending}: {person.firstName} {person.lastName}
          </p>
        </div>
      </header>

      {recovered && (
        <p
          role="status"
          className="rounded-lg bg-muted p-3 text-sm text-muted-foreground"
        >
          {t.recovered}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p>
            {error === 'LOAD_ERROR'
              ? t.loadError
              : error === 'CONFLICT'
                ? t.conflict
                : error}
          </p>
          {conflict && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-11"
                onClick={copyEntries}
              >
                {copied ? t.copied : t.copy}
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  if (!dirty || window.confirm(t.reloadConfirm)) {
                    clearLocalDraft();
                    void load();
                  }
                }}
              >
                {t.reload}
              </Button>
            </div>
          )}
        </div>
      )}

      {workspace.completedAt ? (
        <section className="rounded-xl border bg-card p-5 sm:p-7">
          <CheckCircle2 className="mb-3 size-8 text-primary" aria-hidden />
          <h2
            ref={heading}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {t.complete}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{t.completeHelp}</p>
          <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-4 text-sm">
            {state.outcome}
          </p>
          <ul className="my-5 space-y-3 text-sm">
            <li className="flex gap-2">
              <Check className="size-4 shrink-0 text-primary" />
              {t.activitySaved}
            </li>
            {result?.nextEventId && (
              <li>
                <Link
                  className={linkClass}
                  href={`/court-day/${result.nextEventId}`}
                >
                  {t.eventSaved} →
                </Link>
              </li>
            )}
            {result?.taskId && (
              <li>
                <Link
                  className={linkClass}
                  href={`/cases/${event.caseId}?tab=tasks`}
                >
                  {t.taskSaved} →
                </Link>
              </li>
            )}
            {result?.expenseId && (
              <li>
                <Link
                  className={linkClass}
                  href={`/cases/${event.caseId}?tab=billing`}
                >
                  {t.expenseSaved} →
                </Link>
              </li>
            )}
            {result?.draftId && (
              <li className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="font-medium">{t.draftSaved}</p>
                <p className="mt-1 text-muted-foreground">{t.nothingSent}</p>
                <Link
                  className={linkClass}
                  href={`/cases/${event.caseId}?tab=closing-report&draftId=${result.draftId}`}
                >
                  {t.draftOpen} →
                </Link>
              </li>
            )}
          </ul>
          <p className="text-xs text-muted-foreground">
            {t.saved} · {date(workspace.completedAt)}
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-lg border p-3">
            <p className="text-sm font-medium">{locale === 'th' ? 'เตรียมใช้งานเมื่อไม่มีอินเทอร์เน็ต' : 'Prepare for offline use'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{locale === 'th' ? 'บันทึกแฟ้มก่อน แล้วเก็บไฟล์ที่เลือกและแบบบันทึกไว้ในเครื่อง 24 ชั่วโมง รวมไฟล์ไม่เกิน 50 MB' : 'Save first, then store selected files and notes on this device for 24 hours, up to 50 MB.'}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={dirty || busy || offlineBusy || conflict} className="min-h-11" onClick={async () => { if (!token || !user || !data || !state) return; setOfflineBusy(true); try { setOfflineUrl(await prepareCourtOffline(token, user, data, state, locale)); } catch(e) { setError(e instanceof Error ? e.message : t.error); } finally { setOfflineBusy(false); } }}>{offlineBusy ? (locale === 'th' ? 'กำลังเก็บไฟล์…' : 'Saving files…') : (locale === 'th' ? 'เก็บแฟ้มไว้ใช้แบบออฟไลน์' : 'Save an offline pack')}</Button>{offlineUrl && <a className={linkClass} href={offlineUrl}>{locale === 'th' ? 'เปิดแฟ้มออฟไลน์ →' : 'Open offline pack →'}</a>}</div>
          </section>
          <nav
            aria-label={t.title}
            className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
          >
            {[t.prep, t.outcome, t.review].map((label, index) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                aria-current={stage === index ? 'step' : undefined}
                onClick={() => go(index)}
                className={cn(
                  'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:gap-2 sm:text-sm',
                  stage === index
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-card/60',
                )}
              >
                <span className="font-mono">0{index + 1}</span>
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <h2
            ref={heading}
            tabIndex={-1}
            className="scroll-mt-20 text-lg font-semibold outline-none"
          >
            {sectionTitle}
          </h2>
          {stage === 0 &&
            (unavailableDocuments.length > 0 ||
              unavailableTasks.length > 0) && (
              <div className="rounded-lg border p-3 text-sm">
                <p>{t.unavailable}</p>
                <Button
                  variant="outline"
                  className="mt-2 min-h-11"
                  disabled={busy}
                  onClick={() =>
                    edit({
                      documents: state.documents.filter((pin) =>
                        documents.some((doc) => doc.id === pin.id),
                      ),
                      taskIds: state.taskIds.filter((id) =>
                        tasks.some((task) => task.id === id),
                      ),
                    })
                  }
                >
                  {t.removeUnavailable}
                </Button>
              </div>
            )}
          <fieldset disabled={busy} className="min-w-0 space-y-5">
            {stage === 0 && (
              <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{t.checklist}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t.checklistHelp}
                      </p>
                    </div>
                    {state.checklist.length > 0 && (
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {checked}/{state.checklist.length} {t.done}
                      </span>
                    )}
                  </div>
                  {state.checklist.length === 0 && (
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-sm text-muted-foreground">
                        {t.emptyChecklist}
                      </p>
                      <Button
                        variant="outline"
                        className="mt-3 min-h-11"
                        onClick={() =>
                          edit({
                            checklist: t.starters.map((title) => ({
                              id: crypto.randomUUID(),
                              title,
                              done: false,
                            })),
                          })
                        }
                      >
                        {t.starter}
                      </Button>
                    </div>
                  )}
                  <ul className="divide-y">
                    {state.checklist.map((item) => (
                      <li key={item.id} className="flex items-start gap-2 py-1">
                        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-5 shrink-0 accent-primary"
                            checked={item.done}
                            onChange={() =>
                              edit({
                                checklist: state.checklist.map((x) =>
                                  x.id === item.id
                                    ? { ...x, done: !x.done }
                                    : x,
                                ),
                              })
                            }
                          />
                          <span
                            className={cn(
                              'break-words',
                              item.done && 'text-muted-foreground line-through',
                            )}
                          >
                            {item.title}
                          </span>
                        </label>
                        <button
                          type="button"
                          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`${t.remove}: ${item.title}`}
                          onClick={() =>
                            edit({
                              checklist: state.checklist.filter(
                                (x) => x.id !== item.id,
                              ),
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (itemTitle.trim() && state.checklist.length < 50) {
                        edit({
                          checklist: [
                            ...state.checklist,
                            {
                              id: crypto.randomUUID(),
                              title: itemTitle.trim(),
                              done: false,
                            },
                          ],
                        });
                        setItemTitle('');
                      }
                    }}
                  >
                    <Input
                      className="min-h-11 min-w-0"
                      aria-label={t.newItem}
                      placeholder={t.newItem}
                      maxLength={200}
                      value={itemTitle}
                      onChange={(e) => setItemTitle(e.target.value)}
                    />
                    <Button
                      type="submit"
                      className="min-h-11 shrink-0"
                      aria-label={t.add}
                      disabled={
                        !itemTitle.trim() || state.checklist.length >= 50
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                  </form>
                  <label className="block pt-2 text-sm font-medium">
                    {t.notes}
                    <textarea
                      aria-label={t.notes}
                      className={`${inputClass} mt-2`}
                      rows={4}
                      maxLength={10000}
                      value={state.notes}
                      onChange={(e) => edit({ notes: e.target.value })}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">{t.notesHelp}</p>
                </section>
                <div className="min-w-0 space-y-5">
                  <section className="rounded-xl border bg-card p-4 sm:p-5">
                    <h3 className="font-semibold">{t.documents}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.docHelp}
                    </p>
                    {!documents.length && (
                      <p className="mt-4 text-sm text-muted-foreground">
                        {t.noDocs}
                      </p>
                    )}
                    <ul className="mt-3 divide-y">
                      {documents.map((doc) => {
                        const pin = state.documents.find(
                          (x) => x.id === doc.id,
                        );
                        const filename =
                          (pin
                            ? doc.versions?.find(
                                (v) => v.version === pin.version,
                              )?.filename
                            : undefined) ?? doc.filename;
                        return (
                          <li key={doc.id} className="py-2">
                            <div className="flex items-start gap-2">
                              <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 py-2 text-sm">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 size-5 shrink-0 accent-primary"
                                  checked={!!pin}
                                  onChange={() =>
                                    edit({
                                      documents: pin
                                        ? state.documents.filter(
                                            (x) => x.id !== doc.id,
                                          )
                                        : [
                                            ...state.documents,
                                            {
                                              id: doc.id,
                                              version: doc.version,
                                            },
                                          ],
                                    })
                                  }
                                />
                                <span className="min-w-0 break-words">
                                  {filename}
                                  <span className="mt-1 block text-xs text-muted-foreground">
                                    {t.version} {pin?.version ?? doc.version}
                                    {pin && pin.version !== doc.version
                                      ? ` · ${t.newer}`
                                      : ''}
                                  </span>
                                </span>
                              </label>
                              <button
                                type="button"
                                className="flex size-11 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                disabled={!!downloading}
                                aria-label={`${t.open}: ${filename}`}
                                onClick={() =>
                                  download(doc, pin?.version ?? doc.version)
                                }
                              >
                                <Download
                                  className={cn(
                                    'size-4',
                                    downloading === doc.id && 'animate-pulse',
                                  )}
                                />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <Link
                      className={linkClass}
                      href={`/cases/${event.caseId}?tab=documents`}
                      onClick={canLeave}
                    >
                      <FileText className="size-4" />
                      {t.upload}
                    </Link>
                  </section>
                  <section className="rounded-xl border bg-card p-4 sm:p-5">
                    <h3 className="font-semibold">{t.tasks}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t.tasksHelp}
                    </p>
                    {!tasks.length && (
                      <p className="mt-4 text-sm text-muted-foreground">
                        {t.noTasks}
                      </p>
                    )}
                    <ul className="mt-3 divide-y">
                      {tasks.map((task) => (
                        <li key={task.id}>
                          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3 text-sm">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-5 shrink-0 accent-primary"
                              checked={state.taskIds.includes(task.id)}
                              onChange={() =>
                                edit({
                                  taskIds: state.taskIds.includes(task.id)
                                    ? state.taskIds.filter(
                                        (id) => id !== task.id,
                                      )
                                    : [...state.taskIds, task.id],
                                })
                              }
                            />
                            <span className="min-w-0 break-words">
                              {task.title}
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {task.status === TaskStatus.DONE
                                  ? `✓ ${t.done}`
                                  : locale === 'th'
                                    ? 'ยังไม่เสร็จ'
                                    : 'Not complete'}
                                {task.assignee
                                  ? ` · ${task.assignee.firstName} ${task.assignee.lastName}`
                                  : ''}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={`/cases/${event.caseId}?tab=tasks`}
                      className={linkClass}
                      onClick={canLeave}
                    >
                      {t.openTasks}
                    </Link>
                  </section>
                </div>
              </div>
            )}
            {stage === 1 && (
              <section className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
                {future && (
                  <p
                    role="status"
                    className="rounded-lg bg-muted p-3 text-sm text-muted-foreground"
                  >
                    {t.future}
                  </p>
                )}
                {state.notes && (
                  <details className="rounded-lg bg-muted/40 p-3 text-sm">
                    <summary className="cursor-pointer py-1 font-medium">
                      {t.notes}
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap break-words">
                      {state.notes}
                    </p>
                  </details>
                )}
                <label className="block text-sm font-medium">
                  {t.resultLabel}
                  <textarea
                    aria-label={t.resultLabel}
                    className={`${inputClass} mt-2`}
                    rows={5}
                    value={state.outcome}
                    maxLength={10000}
                    placeholder={t.resultHint}
                    onChange={(e) => edit({ outcome: e.target.value })}
                  />
                </label>
                <Option
                  label={t.nextHearing}
                  checked={state.nextHearing}
                  onChange={() => edit({ nextHearing: !state.nextHearing })}
                >
                  <label className="block text-sm">
                    {t.nextTitle}
                    <Input
                      className="mt-1 min-h-11"
                      value={state.nextTitle}
                      maxLength={200}
                      onChange={(e) => edit({ nextTitle: e.target.value })}
                    />
                  </label>
                  <label className="block min-w-0 text-sm">
                    {t.nextAt}
                    <input
                      type="datetime-local"
                      className={`${inputClass} mt-1`}
                      value={
                        state.nextAt ? bangkokInputValue(state.nextAt) : ''
                      }
                      min={bangkokInputValue(event.startAt)}
                      onChange={(e) =>
                        edit({
                          nextAt: e.target.value
                            ? bangkokInputToIso(e.target.value)
                            : '',
                        })
                      }
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">{t.timezone}</p>
                </Option>
                <Option
                  label={t.followUp}
                  checked={state.followUp}
                  onChange={() => edit({ followUp: !state.followUp })}
                >
                  <label className="block text-sm">
                    {t.taskTitle}
                    <Input
                      className="mt-1 min-h-11"
                      maxLength={200}
                      value={state.taskTitle}
                      onChange={(e) => edit({ taskTitle: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    {t.taskDue}
                    <input
                      type="date"
                      className={`${inputClass} mt-1`}
                      value={
                        state.taskDue
                          ? bangkokDateInputValue(state.taskDue)
                          : ''
                      }
                      onChange={(e) =>
                        edit({
                          taskDue: e.target.value
                            ? bangkokDateInputToIso(e.target.value)
                            : '',
                        })
                      }
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">{t.taskOwner}</p>
                </Option>
                <Option
                  label={t.expense}
                  checked={state.expense}
                  onChange={() => edit({ expense: !state.expense })}
                >
                  <label className="block text-sm">
                    {t.expenseCategory}
                    <select
                      className={`${inputClass} mt-1`}
                      value={state.expenseCategory ?? 'ค่าเดินทาง'}
                      onChange={(e) =>
                        edit({ expenseCategory: e.target.value })
                      }
                    >
                      {EXPENSE_CATEGORIES.map((category, i) => (
                        <option key={category} value={category}>
                          {locale === 'th'
                            ? category
                            : [
                                'Travel',
                                'Court fees',
                                'Copies',
                                'Office supplies',
                                'Accommodation',
                                'Other',
                              ][i]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    {t.amount}
                    <Input
                      className="mt-1 min-h-11"
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={state.amount}
                      onChange={(e) => edit({ amount: e.target.value })}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t.expenseHelp}
                  </p>
                </Option>
                <Option
                  label={t.clientDraft}
                  checked={state.clientDraft}
                  onChange={() => edit({ clientDraft: !state.clientDraft })}
                >
                  <p className="text-sm text-muted-foreground">{t.draftHelp}</p>
                </Option>
              </section>
            )}
            {stage === 2 && (
              <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
                <p className="text-sm text-muted-foreground">{t.reviewHelp}</p>
                <div>
                  <h3 className="text-sm font-medium">{t.resultLabel}</h3>
                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-sm">
                    {state.outcome || t.emptyOutcome}
                  </p>
                </div>
                <dl className="divide-y text-sm">
                  {state.nextHearing && (
                    <ReviewRow
                      title={t.nextHearing}
                      value={`${state.nextTitle || '—'} · ${state.nextAt ? date(state.nextAt) : '—'}`}
                    />
                  )}
                  {state.followUp && (
                    <ReviewRow
                      title={t.followUp}
                      value={`${state.taskTitle || '—'}${state.taskDue ? ` · ${date(state.taskDue)}` : ''}`}
                    />
                  )}
                  {state.expense && (
                    <ReviewRow
                      title={t.expense}
                      value={`฿${state.amount || '—'} · ${t.expenseHelp}`}
                    />
                  )}
                  {state.clientDraft && (
                    <ReviewRow title={t.clientDraft} value={t.draftHelp} />
                  )}
                </dl>
                {!valid && (
                  <p role="alert" className="text-sm text-destructive">
                    {t.required}
                  </p>
                )}
                {future && (
                  <p className="text-sm text-muted-foreground">{t.future}</p>
                )}
              </section>
            )}
          </fieldset>
          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
            <p
              role="status"
              aria-live="polite"
              className="text-xs text-muted-foreground"
            >
              {busy
                ? t.saving
                : dirty
                  ? t.unsaved
                  : workspace.updatedAt
                    ? t.saved
                    : t.prep}
            </p>
            <div className="flex flex-wrap gap-2">
              {stage > 0 && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={busy}
                  onClick={() => go(stage - 1)}
                >
                  {t.prev}
                </Button>
              )}
              {stage === 0 && (
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={
                    busy || conflict || (!dirty && !!workspace.updatedAt)
                  }
                  onClick={() => save()}
                >
                  {t.save}
                </Button>
              )}
              {stage < 2 ? (
                <Button
                  className="min-h-11"
                  disabled={busy || conflict}
                  onClick={() => save(stage + 1)}
                >
                  {stage === 0 ? t.saveNext : t.inspect}
                </Button>
              ) : (
                <Button
                  className="min-h-11"
                  disabled={busy || conflict || !valid || future}
                  onClick={complete}
                >
                  {busy ? t.saving : t.confirm}
                </Button>
              )}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
function Option({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3 sm:p-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-primary"
          checked={checked}
          onChange={onChange}
        />
        {label}
      </label>
      {checked && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}
function ReviewRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="font-medium">{title}</dt>
      <dd className="break-words text-muted-foreground">{value}</dd>
    </div>
  );
}
