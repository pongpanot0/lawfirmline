'use client';

import { useState } from 'react';
import { TaskPriority, TaskStatus } from '@lawfirm/shared';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  dueDate?: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
  subtaskCount?: number;
  subtaskDoneCount?: number;
  attachmentCount?: number;
  commentCount?: number;
}

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  currentUserId: string;
  isReviewer?: boolean;
  /** Title click opens the task's detail drawer; omitted keeps titles inert. */
  onOpen?: (taskId: string) => void;
  /** Case-bound tasks only: the lawyer↔senior handoff/review pipeline. */
  enableHandoff?: boolean;
  /**
   * Handoff/review actions may reject; a rejection keeps the form open and is
   * shown beside the buttons, so the sender sees why and can fix it.
   */
  onHandoff?: (taskId: string, note: string, reviewerId?: string) => void | Promise<void>;
  onAccept?: (taskId: string) => void | Promise<void>;
  onReject?: (taskId: string, reason: string) => void | Promise<void>;
  /**
   * Case-bound tasks: whether this viewer may hand tasks off at all. The
   * case's own reviewer has nobody to hand to, so the button is not offered.
   */
  handoffAllowed?: boolean;
  /** Case-bound tasks: who a handoff goes to, named on the button. */
  reviewerName?: string;
  /** Standalone tasks only: no fixed senior lawyer, so the sender picks a reviewer at handoff time. */
  requireReviewerOnHandoff?: boolean;
  reviewerOptions?: { id: string; firstName: string; lastName: string }[];
  /** Set when the reviewer list could not be loaded — distinct from "nobody to pick". */
  reviewerLoadError?: string;
  onRetryReviewers?: () => void;
  /**
   * `list` orders every task by how soon it is due and states its status on the
   * row. It is what a lawyer opening the page needs: the board answers "where
   * does everything stand", which is a question for a review meeting, not for
   * deciding what to do next.
   */
  layout?: 'board' | 'list';
}

const HANDOFF_SOURCE_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.NEEDS_REVISION,
  TaskStatus.DONE,
];

export function KanbanBoard({
  tasks,
  onStatusChange,
  currentUserId,
  isReviewer = false,
  onOpen,
  enableHandoff = false,
  onHandoff,
  onAccept,
  onReject,
  handoffAllowed = true,
  reviewerName,
  requireReviewerOnHandoff = false,
  reviewerOptions = [],
  reviewerLoadError,
  onRetryReviewers,
  layout = 'board',
}: KanbanBoardProps) {
  const d = useDashboardT();
  const [actionError, setActionError] = useState<{ taskId: string; message: string } | null>(null);
  const [handoffTaskId, setHandoffTaskId] = useState<string | null>(null);
  const [handoffNote, setHandoffNote] = useState('');
  const [handoffReviewerId, setHandoffReviewerId] = useState('');
  const [rejectTaskId, setRejectTaskId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const columns: { status: TaskStatus; label: string; color: string }[] = [
    { status: TaskStatus.TODO, label: d.todos.columnTodo, color: 'border-t-muted-foreground/40' },
    { status: TaskStatus.IN_PROGRESS, label: d.todos.columnInProgress, color: 'border-t-amber-400' },
    ...(enableHandoff
      ? [
          { status: TaskStatus.PENDING_REVIEW, label: d.todos.columnPendingReview, color: 'border-t-sky-400' },
          { status: TaskStatus.NEEDS_REVISION, label: d.todos.columnNeedsRevision, color: 'border-t-rose-400' },
        ]
      : []),
    { status: TaskStatus.DONE, label: d.todos.columnDone, color: 'border-t-emerald-400' },
  ];

  /**
   * Runs a handoff/review action and reports its outcome on the task card.
   * The server's own reason is shown when it gave one (it says things like
   * "you are already this case's reviewer"), otherwise a generic line.
   */
  const runAction = async (taskId: string, action: () => void | Promise<void>, onDone: () => void) => {
    setActionError(null);
    try {
      await action();
      onDone();
    } catch (err) {
      const message = err instanceof ApiError && err.message ? err.message : d.todos.actionFailed;
      setActionError({ taskId, message });
    }
  };

  const reviewerChoices = reviewerOptions.filter((u) => u.id !== currentUserId);

  // A finished case task may still be sent for review; a finished personal
  // task may not (the server refuses it), so the button is not offered.
  const handoffSourceStatuses = requireReviewerOnHandoff
    ? HANDOFF_SOURCE_STATUSES.filter((status) => status !== TaskStatus.DONE)
    : HANDOFF_SOURCE_STATUSES;

  const plainStatusTargets: { status: TaskStatus; label: string }[] = [
    { status: TaskStatus.TODO, label: d.todos.columnTodo },
    { status: TaskStatus.IN_PROGRESS, label: d.todos.columnInProgress },
    { status: TaskStatus.DONE, label: d.todos.columnDone },
  ];

  const renderTask = (task: Task) => {
        const isAssignee = task.assignee?.id === currentUserId;
        const canSetPlainStatus = isAssignee || !task.assignee;
        const canHandoff =
          enableHandoff &&
          handoffAllowed &&
          (isAssignee || !task.assignee) &&
          handoffSourceStatuses.includes(task.status);
        const canReview =
          enableHandoff &&
          task.status === TaskStatus.PENDING_REVIEW &&
          (isReviewer || isAssignee);
        const priorityBar =
          task.priority === TaskPriority.HIGH
            ? 'border-l-4 border-l-rose-500'
            : task.priority === TaskPriority.LOW
              ? 'border-l-4 border-l-muted-foreground/30'
              : '';
        const labels = task.labels ?? [];
        const counters = [
          task.subtaskCount ? `☑ ${task.subtaskDoneCount ?? 0}/${task.subtaskCount}` : null,
          task.attachmentCount ? `📎 ${task.attachmentCount}` : null,
          task.commentCount ? `💬 ${task.commentCount}` : null,
        ].filter(Boolean);

        return (
          <div key={task.id} className={`rounded-lg border bg-card p-3 shadow-soft ${priorityBar}`}>
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className="text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {task.title}
              </button>
            ) : (
              <p className="text-sm font-medium text-foreground">{task.title}</p>
            )}
            {labels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {labels.slice(0, 3).map((label) => (
                  <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {label}
                  </span>
                ))}
                {labels.length > 3 && (
                  <span className="text-[11px] text-muted-foreground">+{labels.length - 3}</span>
                )}
              </div>
            )}
            {task.description && (
              <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
            )}
            {task.assignee && (
              <p className="mt-2 text-xs text-muted-foreground">
                {task.assignee.firstName} {task.assignee.lastName}
              </p>
            )}
            {task.dueDate && (
              <p className="mt-1 text-xs text-muted-foreground">
                {fmt(d.todos.due, { date: formatDate(task.dueDate) })}
              </p>
            )}
            {counters.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">{counters.join(' · ')}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-1">
              {canSetPlainStatus &&
                plainStatusTargets
                  .filter((c) => c.status !== task.status)
                  .map((c) => (
                    <button
                      key={c.status}
                      onClick={() => onStatusChange(task.id, c.status)}
                      className="rounded border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    >
                      → {c.label}
                    </button>
                  ))}
              {canHandoff && onHandoff && (
                <button
                  onClick={() => {
                    setHandoffTaskId(task.id);
                    setHandoffNote('');
                    setHandoffReviewerId('');
                  }}
                  className="rounded border border-sky-400 px-2 py-0.5 text-xs text-sky-600 hover:bg-sky-50"
                >
                  {reviewerName
                    ? fmt(d.todos.handoffToReviewer, { name: reviewerName })
                    : d.todos.handoffToSenior}
                </button>
              )}
              {canReview && onAccept && (
                <button
                  onClick={() => runAction(task.id, () => onAccept(task.id), () => undefined)}
                  className="rounded border border-emerald-400 px-2 py-0.5 text-xs text-emerald-600 hover:bg-emerald-50"
                >
                  {d.todos.accept}
                </button>
              )}
              {canReview && onReject && (
                <button
                  onClick={() => {
                    setRejectTaskId(task.id);
                    setRejectReason('');
                  }}
                  className="rounded border border-rose-400 px-2 py-0.5 text-xs text-rose-600 hover:bg-rose-50"
                >
                  {d.todos.reject}
                </button>
              )}
            </div>

            {handoffTaskId === task.id && onHandoff && (
              <div className="mt-3 space-y-2 border-t pt-2">
                {requireReviewerOnHandoff && reviewerLoadError && (
                  <div className="flex items-center justify-between gap-2">
                    <p role="alert" className="text-xs text-destructive">{reviewerLoadError}</p>
                    {onRetryReviewers && (
                      <button
                        type="button"
                        onClick={onRetryReviewers}
                        className="rounded border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {d.common.retry}
                      </button>
                    )}
                  </div>
                )}
                {requireReviewerOnHandoff && !reviewerLoadError && reviewerChoices.length === 0 && (
                  <p className="text-xs text-muted-foreground">{d.todos.noReviewers}</p>
                )}
                {requireReviewerOnHandoff && !reviewerLoadError && reviewerChoices.length > 0 && (
                  <select
                    value={handoffReviewerId}
                    onChange={(e) => setHandoffReviewerId(e.target.value)}
                    className="w-full rounded border px-2 py-1 text-xs"
                  >
                    <option value="">{d.todos.handoffReviewerPlaceholder}</option>
                    {reviewerChoices.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  value={handoffNote}
                  onChange={(e) => setHandoffNote(e.target.value)}
                  placeholder={d.todos.handoffNotePlaceholder}
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    disabled={requireReviewerOnHandoff && !handoffReviewerId}
                    onClick={() =>
                      runAction(
                        task.id,
                        () =>
                          onHandoff(
                            task.id,
                            handoffNote,
                            requireReviewerOnHandoff ? handoffReviewerId : undefined,
                          ),
                        () => setHandoffTaskId(null),
                      )
                    }
                    className="rounded bg-sky-500 px-2 py-1 text-xs text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    {d.todos.handoffSubmit}
                  </button>
                  <button
                    onClick={() => setHandoffTaskId(null)}
                    className="rounded border px-2 py-1 text-xs text-muted-foreground"
                  >
                    {d.todos.cancel}
                  </button>
                </div>
              </div>
            )}

            {rejectTaskId === task.id && onReject && (
              <div className="mt-3 space-y-2 border-t pt-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={d.todos.rejectReasonPlaceholder}
                  className="w-full rounded border px-2 py-1 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    disabled={!rejectReason.trim()}
                    onClick={() => {
                      if (!rejectReason.trim()) return;
                      runAction(
                        task.id,
                        () => onReject(task.id, rejectReason.trim()),
                        () => setRejectTaskId(null),
                      );
                    }}
                    className="rounded bg-rose-500 px-2 py-1 text-xs text-white hover:bg-rose-600 disabled:opacity-50"
                  >
                    {d.todos.rejectSubmit}
                  </button>
                  <button
                    onClick={() => setRejectTaskId(null)}
                    className="rounded border px-2 py-1 text-xs text-muted-foreground"
                  >
                    {d.todos.cancel}
                  </button>
                </div>
              </div>
            )}
            {actionError?.taskId === task.id && (
              <p role="alert" className="mt-2 text-xs text-destructive">{actionError.message}</p>
            )}
          </div>
        );
  };

  /**
   * Overdue first, then by how soon it is due; anything undated sinks to the
   * bottom. Done tasks sort last whatever their date — they are history.
   */
  const byUrgency = (a: Task, b: Task) => {
    const done = (task: Task) => (task.status === TaskStatus.DONE ? 1 : 0);
    if (done(a) !== done(b)) return done(a) - done(b);
    const due = (task: Task) =>
      task.dueDate ? new Date(task.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return due(a) - due(b);
  };

  const statusLabels: Record<string, string> = {
    [TaskStatus.TODO]: d.todos.columnTodo,
    [TaskStatus.IN_PROGRESS]: d.todos.columnInProgress,
    [TaskStatus.PENDING_REVIEW]: d.todos.columnPendingReview,
    [TaskStatus.NEEDS_REVISION]: d.todos.columnNeedsRevision,
    [TaskStatus.DONE]: d.todos.columnDone,
  };

  if (layout === 'list') {
    const ordered = [...tasks].sort(byUrgency);
    if (ordered.length === 0) {
      return <p className="py-8 text-center text-sm text-muted-foreground">{d.todos.noTasks}</p>;
    }
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return (
      <ul className="space-y-3">
        {ordered.map((task) => {
          const overdue =
            !!task.dueDate &&
            task.status !== TaskStatus.DONE &&
            new Date(task.dueDate) < startOfToday;
          return (
            <li key={task.id}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {statusLabels[task.status] ?? task.status}
                </span>
                {overdue && (
                  <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive">
                    {d.todos.overdue}
                  </span>
                )}
              </div>
              {renderTask(task)}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 gap-4 md:grid-cols-3 ${enableHandoff ? 'xl:grid-cols-5' : ''}`}
    >
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            className={`rounded-xl border bg-muted/40 ${col.color} border-t-4`}
          >
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                {col.label}
                <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">
                  {colTasks.length}
                </span>
              </h3>
            </div>
            <div className="space-y-3 p-3">
              {colTasks.map(renderTask)}
              {colTasks.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">{d.todos.noTasks}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
