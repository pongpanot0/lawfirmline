'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Paperclip, Trash2, Download } from 'lucide-react';
import {
  normalizeTaskLabels,
  TASK_PRIORITY_LABELS,
  TaskPriority,
  TaskStatus,
} from '@lawfirm/shared';
import { api, ApiError, TaskDetail, UserItem } from '@/lib/api';
import { formatBytes, downloadTaskAttachment } from '@/lib/task-detail';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/utils';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';

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
  const { token } = useAuth();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [comment, setComment] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token || !taskId) return;
    setError('');
    try {
      const detail = await api.getTaskDetail(token, taskId);
      setTask(detail);
      setTitle(detail.title);
      setDescription(detail.description ?? '');
    } catch (err) {
      setTask(null);
      setError(err instanceof ApiError && err.status === 403 ? d.taskDetail.forbidden : d.taskDetail.loadFailed);
    }
  }, [token, taskId, d]);

  useEffect(() => {
    setTask(null);
    setNotice('');
    void load();
  }, [load]);

  // Escape closes; the body stops scrolling while the drawer is up.
  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [taskId, onClose]);

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
      setError(err instanceof Error && err.message === 'TASK_LABELS_TOO_MANY' ? 'ใส่ label ได้ไม่เกิน 10 รายการ' : 'label ยาวได้ไม่เกิน 30 ตัวอักษร');
    }
  };

  const upload = async (files: FileList | null) => {
    if (!token || !task || !files?.length) return;
    setUploadError('');
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await api.uploadTaskAttachment(token, task.id, file);
      }
      await load();
      onChanged();
    } catch (err) {
      setUploadError(err instanceof ApiError && err.message ? err.message : d.taskDetail.uploadFailed);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const download = async (attachmentId: string, filename: string) => {
    if (!token || !task || downloadingId) return;
    setDownloadingId(attachmentId);
    setUploadError('');
    try {
      await downloadTaskAttachment(token, task.id, attachmentId, filename);
    } catch (err) {
      setUploadError(err instanceof ApiError && err.message ? err.message : d.taskDetail.uploadFailed);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={d.taskDetail.title}>
      <button type="button" aria-label={d.taskDetail.close} onClick={onClose} className="flex-1 bg-black/30" />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-card shadow-xl">
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
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => task && title.trim() && title.trim() !== task.title && patch({ title: title.trim() }, d.taskDetail.saved)}
              disabled={!task || busy}
              aria-label={d.taskDetail.title}
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
            <section className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="td-status" className={label}>{d.taskDetail.status}</label>
                <select id="td-status" value={task.status} disabled={busy || !STATUS_OPTIONS.includes(task.status)} onChange={(e) => patch({ status: e.target.value })} className={field}>
                  {(STATUS_OPTIONS.includes(task.status) ? STATUS_OPTIONS : [task.status]).map((s) => (
                    <option key={s} value={s}>{statusLabel[s]}</option>
                  ))}
                </select>
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
                      {TASK_PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="td-assignee" className={label}>{d.taskDetail.assignee}</label>
                <select id="td-assignee" value={task.assignee?.id ?? ''} disabled={busy} onChange={(e) => e.target.value && patch({ assigneeId: e.target.value })} className={field}>
                  <option value="">{d.taskDetail.unassigned}</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="td-due" className={label}>{d.taskDetail.dueDate}</label>
                <input id="td-due" type="date" disabled={busy} value={task.dueDate ? bangkokDateInputValue(task.dueDate) : ''} onChange={(e) => e.target.value && patch({ dueDate: e.target.value })} className={field} />
              </div>
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
                <h3 className="text-sm font-semibold">{d.taskDetail.subtasks} {task.subtasks.length > 0 && <span className="text-xs font-normal text-muted-foreground">{task.subtasks.filter((s) => s.status === TaskStatus.DONE).length}/{task.subtasks.length}</span>}</h3>
                <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                  {task.subtasks.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        aria-label={s.title}
                        checked={s.status === TaskStatus.DONE}
                        disabled={busy}
                        onChange={(e) => run(() => api.updateAnyTask(token!, { id: s.id, caseId: task.caseId }, { status: e.target.checked ? TaskStatus.DONE : TaskStatus.TODO }))}
                        className="h-4 w-4"
                      />
                      <button type="button" onClick={() => onNavigate(s.id)} className={`flex-1 text-left hover:text-primary hover:underline ${s.status === TaskStatus.DONE ? 'text-muted-foreground line-through' : ''}`}>
                        {s.title}
                      </button>
                      {s.assignee && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{s.assignee.firstName}</span>}
                      {s.dueDate && <span className="text-xs text-muted-foreground">{formatDate(s.dueDate)}</span>}
                    </li>
                  ))}
                  {task.subtasks.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">{d.taskDetail.noSubtasks}</li>}
                </ul>
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = subtaskTitle.trim();
                    if (!t) return;
                    setSubtaskTitle('');
                    void run(() => api.createSubtask(token!, task.id, { title: t }));
                  }}
                >
                  <input value={subtaskTitle} disabled={busy} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder={d.taskDetail.subtaskPlaceholder} className={`${field} mt-0`} />
                  <Button type="submit" size="sm" variant="outline" disabled={busy || !subtaskTitle.trim()}>{d.taskDetail.addSubtask}</Button>
                </form>
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold">{d.taskDetail.attachments}</h3>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
                onClick={() => fileInput.current?.click()}
                className="mt-2 cursor-pointer rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground hover:bg-muted/50"
              >
                <Paperclip className="mx-auto mb-1 h-4 w-4" />
                {busy ? d.taskDetail.uploading : d.taskDetail.dropHint}
                <p className="mt-1">{d.taskDetail.fileTypesHint}</p>
                <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.docx,.xlsx,.txt" onChange={(e) => void upload(e.target.files)} />
              </div>
              {uploadError && <p role="alert" className="mt-2 text-xs text-destructive">{uploadError}</p>}
              <ul className="mt-2 space-y-1">
                {task.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(a.size)} · {a.uploadedBy.firstName}</span>
                    <button
                      type="button"
                      disabled={downloadingId === a.id}
                      aria-label={d.taskDetail.download}
                      onClick={() => void download(a.id, a.filename)}
                      className="rounded p-1 hover:bg-muted disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label={d.taskDetail.delete} disabled={busy} onClick={() => window.confirm(d.taskDetail.confirmDeleteAttachment) && run(() => api.deleteTaskAttachment(token!, task.id, a.id))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
                {task.attachments.length === 0 && <li className="text-xs text-muted-foreground">{d.taskDetail.noAttachments}</li>}
              </ul>
            </section>

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
