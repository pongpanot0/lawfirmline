'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Trash2, Download } from 'lucide-react';
import { canAssignFirmRole, FirmRole, normalizeTaskLabels, TASK_WORK_TYPES, TaskPriority, TaskStatus } from '@lawfirm/shared';
import { api, ApiError, TaskDetail, UserItem } from '@/lib/api';
import { formatBytes, downloadTaskAttachment, priorityLabel } from '@/lib/task-detail';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/utils';
import { bangkokDateInputValue, bangkokInputValue, bangkokInputToIso, bangkokDateInputToIso } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { DateField, DateTimeField, SelectField, TextField, TextareaField } from '@/components/ui/form-fields';
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { useLeaveFlags } from '@/lib/use-leave-flags';
import { leaveWarning } from '@/lib/leave-flags';
import { DocumentDropZone } from '@/components/DocumentDropZone';

interface Props {
  taskId: string | null;
  users: UserItem[];
  onClose: () => void;
  /** Called after any write so the board behind the drawer can refresh. */
  onChanged: () => void;
  /** Open another task in the same drawer (a subtask, or back to the parent). */
  onNavigate: (taskId: string) => void;
}

const STATUS_OPTIONS: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE];

export function TaskDetailDrawer({ taskId, users, onClose, onChanged, onNavigate }: Props) {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskDue, setSubtaskDue] = useState('');
  const [subtaskAssigneeId, setSubtaskAssigneeId] = useState('');
  const [comment, setComment] = useState('');
  const [completed, setCompleted] = useState('');
  const [remaining, setRemaining] = useState('');
  const [blocker, setBlocker] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [siblingTasks, setSiblingTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);

  // ตัวเลือก "รอ task อื่นเสร็จก่อน" — เฉพาะงานในคดีเดียวกัน
  useEffect(() => {
    if (!token || !task?.caseId) {
      setSiblingTasks([]);
      return;
    }
    api
      .getTasks(token, task.caseId)
      .then((rows) =>
        setSiblingTasks(
          (rows as Array<{ id: string; title: string; status: string }>).filter((t) => t.id !== task.id),
        ),
      )
      .catch(() => setSiblingTasks([]));
  }, [token, task?.caseId, task?.id]);
  const today = bangkokDateInputValue(new Date());
  const taskDate = task?.dueDate ? bangkokDateInputValue(task.dueDate) : today;
  const taskLeaveFlags = useLeaveFlags(token, taskDate);
  const subtaskDate = subtaskDue || today;
  const subtaskLeaveFlags = useLeaveFlags(token, subtaskDate);
  const asideRef = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  // Navigating parent → subtask → parent quickly can make an older response
  // land last; only the response for the task currently open is painted.
  const requestedId = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !taskId) return;
    requestedId.current = taskId;
    setError('');
    try {
      const detail = await api.getTaskDetail(token, taskId);
      if (requestedId.current !== taskId) return;
      setTask(detail);
      setTitle(detail.title);
      setDescription(detail.description ?? '');
      setReviewerId(detail.reviewerId ?? '');
    } catch (err) {
      if (requestedId.current !== taskId) return;
      setTask(null);
      setError(err instanceof ApiError && err.status === 403 ? d.taskDetail.forbidden : d.taskDetail.loadFailed);
    }
  }, [token, taskId, d]);

  useEffect(() => {
    setTask(null);
    setNotice('');
    setError('');
    setLabelDraft('');
    setSubtaskTitle('');
    setSubtaskDue('');
    setSubtaskAssigneeId('');
    setAddingSubtask(false);
    setComment('');
    setUploadError('');
    setDownloadingId(null);
    setCompleted(''); setRemaining(''); setBlocker(''); setReviewNote('');
    void load();
  }, [load]);

  // Escape closes, Tab stays inside the drawer, the body stops scrolling, and
  // focus returns to whatever opened it (usually the card title) on close.
  useEffect(() => {
    if (!taskId) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [...(asideRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((el) => !el.hidden && el.offsetParent !== null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = asideRef.current?.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, [taskId, onClose]);

  // First focus lands on the title once the task has loaded.
  useEffect(() => {
    if (task && !asideRef.current?.contains(document.activeElement)) titleInput.current?.focus();
  }, [task?.id]);

  /** Every write goes through here: same error copy, same refresh, same board reload. */
  const run = async (action: () => Promise<unknown>, successNotice = '') => {
    if (!token || !task || busy) return;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await action();
      await load();
      onChanged();
      if (successNotice) setNotice(successNotice);
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : d.taskDetail.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const patch = (data: Record<string, unknown>, successNotice = '') =>
    run(() => api.updateAnyTask(token!, { id: task!.id, caseId: task!.caseId }, data), successNotice);

  const addLabel = () => {
    if (!task) return;
    const draft = labelDraft.trim();
    if (!draft) return;
    try {
      const labels = normalizeTaskLabels([...task.labels, draft]);
      setLabelDraft('');
      void patch({ labels });
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'TASK_LABELS_TOO_MANY'
          ? d.taskDetail.labelTooMany
          : d.taskDetail.labelTooLong,
      );
    }
  };

  const upload = async (files: File[]) => {
    if (!token || !task || !files?.length) return;
    setUploadError('');
    setBusy(true);
    setNotice('');
    const failures: string[] = [];
    let saved = 0;
    try {
      for (const file of files) {
        try {
          await api.uploadTaskAttachment(token, task.id, file);
          saved += 1;
        } catch (err) {
          failures.push(`${file.name}: ${err instanceof ApiError && err.message ? err.message : d.taskDetail.uploadFailed}`);
        }
      }
      if (failures.length) setUploadError(failures.join(' · '));
      if (saved) setNotice(`แนบไฟล์แล้ว ${saved} ไฟล์`);
      await load();
      onChanged();
    } catch (err) {
      setUploadError(err instanceof ApiError && err.message ? err.message : d.taskDetail.uploadFailed);
    } finally {
      setBusy(false);
    }
  };

  const download = async (attachmentId: string, filename: string) => {
    if (!token || !task || downloadingId) return;
    setDownloadingId(attachmentId);
    setUploadError('');
    try {
      await downloadTaskAttachment(token, task.id, attachmentId, filename);
    } catch (err) {
      setUploadError(err instanceof ApiError && err.message ? err.message : d.taskDetail.downloadFailed);
    } finally {
      setDownloadingId(null);
    }
  };

  if (!taskId) return null;

  const statusLabel: Record<TaskStatus, string> = {
    [TaskStatus.TODO]: d.todos.columnTodo,
    [TaskStatus.IN_PROGRESS]: d.todos.columnInProgress,
    [TaskStatus.PENDING_REVIEW]: d.todos.columnPendingReview,
    [TaskStatus.NEEDS_REVISION]: d.todos.columnNeedsRevision,
    [TaskStatus.DONE]: d.todos.columnDone,
  };
  const field = 'mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const label = 'text-xs font-medium text-muted-foreground';
  const manager = !!user && [FirmRole.OWNER, FirmRole.SENIOR_LAWYER].includes(user.firmRole);
  const ownWork = task?.assignee?.id === user?.id;
  const pendingReview = task?.status === TaskStatus.PENDING_REVIEW;
  const canReview = pendingReview && ownWork;
  const statusOptions = task?.requiresReview ? STATUS_OPTIONS.filter((s) => s !== TaskStatus.DONE) : STATUS_OPTIONS;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={d.taskDetail.title}>
      <button type="button" aria-label={d.taskDetail.close} onClick={onClose} className="flex-1 bg-black/30" />
      <aside ref={asideRef} className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1">
            {task?.parent && (
              <button type="button" onClick={() => onNavigate(task.parent!.id)} className="text-xs text-primary hover:underline">
                {d.taskDetail.backToParent} {task.parent.title}
              </button>
            )}
            {task?.case && (
              <p className="text-xs text-muted-foreground">
                {d.taskDetail.caseLink}:{' '}
                <Link href={`/cases/${task.case.id}`} className="text-primary hover:underline">
                  {task.case.ownRef} · {task.case.title}
                </Link>
              </p>
            )}
            <input
              ref={titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (!task) return;
                const next = title.trim();
                // An emptied title is never saved; it falls back to the stored one.
                if (!next) setTitle(task.title);
                else if (next !== task.title) void patch({ title: next }, d.taskDetail.saved);
              }}
              disabled={!task || busy}
              aria-label={d.taskDetail.titleField}
              className="mt-1 w-full rounded-md border border-transparent bg-transparent px-1 text-lg font-semibold hover:border-input focus:border-input focus:outline-none"
            />
          </div>
          <button type="button" onClick={onClose} aria-label={d.taskDetail.close} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && <p role="alert" className="mx-4 mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="mx-4 mt-3 text-xs text-muted-foreground">{notice}</p>}

        {task && (
          <div className="space-y-6 p-4">
            <section aria-label={d.taskDetail.attachments}>
              <h3 className="mb-2 text-sm font-semibold">{d.taskDetail.attachments} ({task.attachments.length})</h3>
              <DocumentDropZone multiple disabled={busy} loading={busy} label="เลือกไฟล์เพิ่ม / ลากไฟล์มาวาง"
                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.txt" hint={d.taskDetail.fileTypesHint} onFiles={files => void upload(files)} />
              {uploadError && <p role="alert" className="mt-2 text-xs text-destructive">{uploadError}</p>}
              <ul className="mt-2 space-y-1">
                {task.attachments.map(a => <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 basis-40 break-words">{a.filename}</span>
                  <span className="text-xs text-muted-foreground">{formatBytes(a.size)} · {a.uploadedBy.firstName}</span>
                  <button type="button" disabled={downloadingId === a.id} aria-label={`${d.taskDetail.download} ${a.filename}`} onClick={() => void download(a.id, a.filename)} className="rounded p-2 hover:bg-muted disabled:opacity-50"><Download className="h-4 w-4" /></button>
                  <button type="button" aria-label={`${d.taskDetail.delete} ${a.filename}`} disabled={busy} onClick={() => window.confirm(d.taskDetail.confirmDeleteAttachment) && run(() => api.deleteTaskAttachment(token!, task.id, a.id))} className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </li>)}
                {task.attachments.length === 0 && <li className="text-xs text-muted-foreground">{d.taskDetail.noAttachments}</li>}
              </ul>
            </section>
            <section className="space-y-3 rounded-xl border bg-muted/20 p-3">
              <h3 className="text-sm font-semibold">แผนและความคืบหน้า</h3>
              <p className="text-xs text-muted-foreground">{TASK_WORK_TYPES.find((t) => t.value === task.workType)?.label ?? 'ยังไม่ระบุประเภทงาน'}{task.requiresReview ? ' · ต้องตรวจงานก่อนเสร็จ' : ''}</p>
              {ownWork && !pendingReview && task.status !== TaskStatus.DONE && <>
                {!task.acknowledgedAt && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => api.acknowledgeTask(token!, task.id), 'รับทราบงานแล้ว')}>ยืนยันรับทราบงาน</Button>}
                <DateField label="แผนทำงานวันที่" value={task.scheduledFor?.slice(0, 10) ?? ''} disabled={busy} onChange={(e) => { if (e.target.value) void run(() => api.confirmTaskPlan(token!, task.id, e.target.value), 'ยืนยันแผนแล้ว'); }} />
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => api.confirmTaskPlan(token!, task.id, today), 'ยืนยันแผนวันนี้แล้ว')}>{task.planConfirmedAt && task.scheduledFor?.slice(0, 10) === today ? 'ยืนยันแผนวันนี้แล้ว · ยืนยันอีกครั้ง' : 'ยืนยันว่าจะทำงานนี้วันนี้'}</Button>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.dailyTaskUpdate(token!, task.id, { completed, remaining, blocker }); setCompleted(''); setRemaining(''); setBlocker(''); }, 'บันทึกความคืบหน้าแล้ว'); }}>
                  <TextareaField label="ทำถึงไหนแล้ว" value={completed} required maxLength={1500} rows={2} disabled={busy} onChange={(e) => setCompleted(e.target.value)} />
                  <TextareaField label="เหลืออะไร" value={remaining} required maxLength={1500} rows={2} disabled={busy} onChange={(e) => setRemaining(e.target.value)} />
                  <TextareaField label="ติดอะไร / ต้องการให้ใครช่วย" value={blocker} maxLength={1500} rows={2} disabled={busy} onChange={(e) => setBlocker(e.target.value)} placeholder="เว้นว่างได้ถ้าไม่มี" />
                  <Button type="submit" size="sm" disabled={busy}>บันทึกความคืบหน้าวันนี้</Button>
                </form>
                {task.requiresReview && <div className="space-y-2 border-t pt-3">
                  <p className="text-xs text-muted-foreground">แนบผลงานด้านล่าง แล้วส่งให้ผู้ตรวจ</p>
                  {!task.reviewerId && !task.caseId && <SelectField label="ผู้ตรวจ" value={reviewerId} required onChange={(e) => setReviewerId(e.target.value)}><option value="">เลือกผู้ตรวจ</option>{users.filter((u) => u.id !== user?.id && u.firmRole && [FirmRole.OWNER, FirmRole.SENIOR_LAWYER].includes(u.firmRole)).map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}</SelectField>}
                  <Button disabled={busy || (!task.caseId && !reviewerId)} onClick={() => void run(() => task.caseId ? api.handoffTask(token!, task.caseId, task.id, {}) : api.handoffTodo(token!, task.id, { reviewerId }), 'ส่งตรวจแล้ว')}>ส่งผลงานให้ตรวจ</Button>
                </div>}
              </>}
              {canReview && <div className="space-y-3">
                <p className="text-xs text-muted-foreground">ตรวจผลงานและประวัติด้านล่างก่อนยืนยัน</p>
                <Button disabled={busy} onClick={() => void run(() => task.caseId ? api.acceptTask(token!, task.caseId, task.id) : api.acceptTodo(token!, task.id), 'ตรวจผ่าน งานเสร็จแล้ว')}>ตรวจผ่านและปิดงาน</Button>
                <TextareaField label="เหตุผลที่ให้แก้ไข" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} disabled={busy} rows={2} />
                <Button variant="outline" disabled={busy || !reviewNote.trim()} onClick={() => void run(() => task.caseId ? api.rejectTask(token!, task.caseId, task.id, { reason: reviewNote.trim() }) : api.rejectTodo(token!, task.id, { reason: reviewNote.trim() }), 'ส่งกลับให้แก้ไขแล้ว')}>ส่งกลับให้แก้ไข</Button>
              </div>}
              {task.comments.filter((c) => c.kind === 'DAILY_UPDATE').slice(-1).map((c) => <div key={c.id} className="border-t pt-3 text-xs text-muted-foreground"><p className="whitespace-pre-line">{c.body}</p><p className="mt-1">{c.author.firstName} · {formatDateTime(c.createdAt)}</p></div>)}
              {!ownWork && !pendingReview && <p className="text-xs text-muted-foreground">ผู้รับผิดชอบเป็นผู้ยืนยันแผนและอัปเดตความคืบหน้า</p>}
            </section>
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <SelectField label={d.taskDetail.status} id="td-status" value={task.status} disabled={busy || pendingReview} onChange={(e) => patch({ status: e.target.value })}>
                  {([...new Set([task.status, ...statusOptions])]).map((s) => (
                    <option key={s} value={s}>{statusLabel[s]}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                <span className={label}>{d.taskDetail.priority}</span>
                <div className="mt-1 flex gap-1">
                  {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={busy}
                      aria-pressed={task.priority === p}
                      onClick={() => task.priority !== p && patch({ priority: p })}
                      className={`rounded-full border px-3 py-1 text-xs ${task.priority === p ? (p === TaskPriority.HIGH ? 'border-rose-500 bg-rose-500/10 text-rose-600' : 'border-primary bg-primary/10 text-primary') : 'border-border text-muted-foreground hover:bg-muted'}`}
                    >
                      {priorityLabel(d, p)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <SelectField label={d.taskDetail.assignee} id="td-assignee" value={task.assignee?.id ?? ''} disabled={busy || !manager || pendingReview} onChange={(e) => e.target.value && patch({ assigneeId: e.target.value })}>
                  <option value="">{d.taskDetail.unassigned}</option>
                  <AssigneeOptions
                    users={users.filter(
                      (u) =>
                        u.id === user?.id ||
                        u.id === task.assignee?.id ||
                        (!!user && u.firmRole != null && canAssignFirmRole(user.firmRole, u.firmRole)),
                    )}
                    flags={taskLeaveFlags}
                  />
                </SelectField>
                {task.assignee && taskLeaveFlags.has(task.assignee.id) && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    {leaveWarning(
                      `${task.assignee.firstName} ${task.assignee.lastName}`,
                      taskDate,
                      taskLeaveFlags.get(task.assignee.id)?.kind,
                    )}
                  </p>
                )}
              </div>
              <div>
                <DateTimeField id="td-due" label={d.taskDetail.dueDate} disabled={busy} value={task.dueDate ? bangkokInputValue(task.dueDate) : ''} onChange={(e) => e.target.value && patch({ dueDate: bangkokInputToIso(e.target.value) })} hint="เวลาไทย" />
              </div>
              <div>
                <label htmlFor="td-recur" className={label}>ทำซ้ำทุก (วัน)</label>
                <input
                  id="td-recur"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="ไม่ทำซ้ำ"
                  disabled={busy}
                  value={task.recurrenceDays ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({ recurrenceDays: Number.isNaN(n) ? null : n });
                  }}
                  className={field}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">เมื่อปิดงาน ระบบสร้างรอบถัดไปให้เอง</p>
              </div>
              {task.caseId && (
                <div className="sm:col-span-2">
                  <label htmlFor="td-blocked" className={label}>รอ task อื่นเสร็จก่อน (blocked by)</label>
                  <select
                    id="td-blocked"
                    disabled={busy}
                    value={task.blockedById ?? ''}
                    onChange={(e) => patch({ blockedById: e.target.value || null })}
                    className={field}
                  >
                    <option value="">— ไม่รอใคร —</option>
                    {siblingTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.status === 'DONE' ? '✓ ' : ''}{t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="sm:col-span-2">
                <label htmlFor="td-label" className={label}>{d.taskDetail.labels}</label>
                <div className="mt-1 flex flex-wrap items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5">
                  {task.labels.map((l) => (
                    <span key={l} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {l}
                      <button type="button" aria-label={`${d.taskDetail.delete} ${l}`} disabled={busy} onClick={() => patch({ labels: task.labels.filter((x) => x !== l) })} className="text-muted-foreground hover:text-foreground">×</button>
                    </span>
                  ))}
                  <input
                    id="td-label"
                    value={labelDraft}
                    disabled={busy}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                    placeholder={d.taskDetail.labelPlaceholder}
                    className="min-w-[8rem] flex-1 bg-transparent px-1 text-sm focus:outline-none"
                  />
                </div>
              </div>
            </section>

            <section>
              <label htmlFor="td-desc" className={label}>{d.taskDetail.description}</label>
              <textarea id="td-desc" rows={4} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} placeholder={d.taskDetail.descriptionPlaceholder} className={field} />
              {description !== (task.description ?? '') && (
                <Button size="sm" className="mt-2" disabled={busy} onClick={() => patch({ description }, d.taskDetail.saved)}>{d.taskDetail.save}</Button>
              )}
            </section>

            {!task.parentId && (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{d.taskDetail.subtasks} {task.subtasks.length > 0 && <span className="text-xs font-normal text-muted-foreground">{task.subtasks.filter((s) => s.status === TaskStatus.DONE).length}/{task.subtasks.length}</span>}</h3>
                  {!addingSubtask && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setAddingSubtask(true)}>{d.taskDetail.addSubtask}</Button>}
                </div>
                {task.subtasks.length > 0 ? <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {task.subtasks.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
                      <input
                        type="checkbox"
                        aria-label={s.title}
                        checked={s.status === TaskStatus.DONE}
                        disabled={busy}
                        onChange={(e) => run(() => api.updateAnyTask(token!, { id: s.id, caseId: task.caseId }, { status: e.target.checked ? TaskStatus.DONE : TaskStatus.TODO }))}
                        className="h-4 w-4"
                      />
                      <button type="button" onClick={() => onNavigate(s.id)} className={`min-w-0 flex-1 break-words text-left hover:text-primary hover:underline ${s.status === TaskStatus.DONE ? 'text-muted-foreground line-through' : ''}`}>
                        {s.title}
                      </button>
                      {s.assignee && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.assignee.firstName}</span>}
                      {s.dueDate && <span className="text-xs text-muted-foreground">{formatDate(s.dueDate)}</span>}
                    </li>
                  ))}
                </ul> : !addingSubtask && <p className="mt-2 text-xs text-muted-foreground">{d.taskDetail.noSubtasks}</p>}
                {addingSubtask && <form
                  className="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = subtaskTitle.trim();
                    if (!t) return;
                    const payload = {
                      title: t,
                      dueDate: subtaskDue ? bangkokDateInputToIso(subtaskDue) : undefined,
                      assigneeId: subtaskAssigneeId || undefined,
                    };
                    void run(async () => {
                      await api.createSubtask(token!, task.id, payload);
                      setSubtaskTitle('');
                      setSubtaskDue('');
                      setSubtaskAssigneeId('');
                      setAddingSubtask(false);
                    }, 'เพิ่มงานย่อยแล้ว');
                  }}
                >
                  <TextField label="งานย่อยต้องทำอะไร" autoFocus required value={subtaskTitle} disabled={busy} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="เช่น ตรวจชื่อพยานในถอดเทป" />
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">เลือกคนทำงาน / กำหนดส่ง (ไม่บังคับ)</summary>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SelectField
                    label="คนทำงานย่อย"
                    value={subtaskAssigneeId}
                    disabled={busy}
                    onChange={(e) => setSubtaskAssigneeId(e.target.value)}
                  >
                    <option value="">ยังไม่มอบหมาย</option>
                    <AssigneeOptions
                      users={users.filter(
                        (u) =>
                          u.id === user?.id ||
                          (manager && !!user && u.firmRole != null && canAssignFirmRole(user.firmRole, u.firmRole)),
                      )}
                      flags={subtaskLeaveFlags}
                    />
                  </SelectField>
                  <DateField label="กำหนดส่งงานย่อย"
                    value={subtaskDue}
                    disabled={busy}
                    onChange={(e) => setSubtaskDue(e.target.value)}
                  />
                  {subtaskAssigneeId && subtaskLeaveFlags.has(subtaskAssigneeId) && (
                    <p className="w-full text-xs text-amber-700 dark:text-amber-400">
                      {leaveWarning(
                        (() => {
                          const u = users.find((x) => x.id === subtaskAssigneeId);
                          return u ? `${u.firstName} ${u.lastName}` : '';
                        })(),
                        subtaskDate,
                        subtaskLeaveFlags.get(subtaskAssigneeId)?.kind,
                      )}
                    </p>
                  )}
                    </div>
                  </details>
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={busy || !subtaskTitle.trim()}>{busy ? 'กำลังบันทึก…' : 'บันทึกงานย่อย'}</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAddingSubtask(false)}>ยกเลิก</Button>
                  </div>
                </form>}
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold">{d.taskDetail.comments}</h3>
              <ul className="mt-2 space-y-2">
                {task.comments.map((c) => (
                  <li key={c.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{c.author.firstName} {c.author.lastName} · {formatDateTime(c.createdAt)}</span>
                      <button type="button" aria-label={d.taskDetail.delete} disabled={busy} onClick={() => window.confirm(d.taskDetail.confirmDeleteComment) && run(() => api.deleteTaskComment(token!, task.id, c.id))} className="hover:text-destructive">×</button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
                {task.comments.length === 0 && <li className="text-xs text-muted-foreground">{d.taskDetail.noComments}</li>}
              </ul>
              <form
                className="mt-2 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const body = comment.trim();
                  if (!body) return;
                  setComment('');
                  void run(() => api.addTaskComment(token!, task.id, body));
                }}
              >
                <textarea rows={2} value={comment} disabled={busy} onChange={(e) => setComment(e.target.value)} placeholder={d.taskDetail.commentPlaceholder} className={`${field} mt-0`} />
                <Button type="submit" size="sm" disabled={busy || !comment.trim()}>{d.taskDetail.addComment}</Button>
              </form>
            </section>

            {task.assignmentLogs && task.assignmentLogs.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold">{d.taskDetail.history}</h3>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {task.assignmentLogs.map((log, i) => (
                    <li key={i}>
                      {formatDateTime(log.createdAt)} · {log.action} → {log.toUser.firstName} {log.toUser.lastName}
                      {log.note ? ` — ${log.note}` : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
