'use client';

import { useState } from 'react';
import { ArrowRight, ListChecks, MessageSquare, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { canActOnReview, effectiveReviewerId, isEligibleReviewer, TaskPriority, TaskStatus, taskStageChip, visibleTaskLabels } from '@lawfirm/shared';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { caseNumberDisplay } from '@/lib/case-number-display';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { handoffNoteError, isHeld, reviewerName as reviewerNameOf } from '@/lib/task-review-view';

/** Dense card action: 44px tall on touch screens, compact from sm up. */
const act = 'inline-flex min-h-11 items-center gap-1 rounded-md border px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:min-h-8';
const field = 'min-h-11 w-full rounded-md border border-input bg-card px-2 text-sm sm:min-h-8 sm:text-xs';

interface Task {
  id: string;
  caseId?: string | null;
  case?: { ownRef: string; title: string; blackCaseNumber?: string | null; redCaseNumber?: string | null; leadLawyerId?: string; leadLawyer?: { id: string; firstName: string; lastName?: string | null } | null } | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  dueDate?: string | null;
  requiresReview?: boolean;
  reviewerId?: string | null;
  reviewer?: { id: string; firstName: string; lastName?: string | null } | null;
  onHold?: { reason: string; endedAt: string | null } | null;
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
  /** Title click opens the task's detail drawer; omitted keeps titles inert. */
  onOpen?: (taskId: string) => void;
  /** Show case context when tasks from several cases share one board. */
  showCaseContext?: boolean;
  /** Case-bound tasks only: the lawyer↔senior handoff/review pipeline. */
  enableHandoff?: boolean;
  /**
   * Handoff/review actions may reject; a rejection keeps the form open and is
   * shown beside the buttons, so the sender sees why and can fix it.
   */
  onHandoff?: (taskId: string, note: string, reviewerId?: string) => void | Promise<void>;
  onAccept?: (taskId: string) => void | Promise<void>;
  onReject?: (taskId: string, reason: string) => void | Promise<void>;
  /** Case boards: the lead reviews reviewer-less tasks and is named on the handoff button. */
  caseLeadId?: string | null;
  /** The viewer's firm role — the owner backstop and the office-manager exclusion depend on it. */
  currentUserRole?: string | null;
  /** Case-bound tasks: who a handoff goes to, named on the button. */
  reviewerName?: string;
  /** Standalone tasks only: no fixed senior lawyer, so the sender picks a reviewer at handoff time. */
  requireReviewerOnHandoff?: boolean;
  reviewerOptions?: { id: string; firstName: string; lastName: string; firmRole?: string | null }[];
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

function caseReferenceLabel(legalCase: NonNullable<Task['case']>) {
  if (!legalCase.blackCaseNumber?.trim() && !legalCase.redCaseNumber?.trim()) return legalCase.ownRef;
  return `คดีดำ ${caseNumberDisplay(legalCase.blackCaseNumber)} · คดีแดง ${caseNumberDisplay(legalCase.redCaseNumber)}`;
}

export function KanbanBoard({
  tasks,
  onStatusChange,
  currentUserId,
  onOpen,
  showCaseContext = false,
  enableHandoff = false,
  onHandoff,
  onAccept,
  onReject,
  caseLeadId,
  currentUserRole,
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
  // HTML5 drag-and-drop between columns. Only the three plain statuses are
  // drop targets — review columns are reached via the handoff/review flows.
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const DROPPABLE_STATUSES: TaskStatus[] = [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE];

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

  

  // A finished case task may still be sent for review; a finished personal
  // task may not (the server refuses it), so the button is not offered.
  const handoffSourceStatuses = requireReviewerOnHandoff
    ? HANDOFF_SOURCE_STATUSES.filter((status) => status !== TaskStatus.DONE)
    : HANDOFF_SOURCE_STATUSES;

  const reviewerChoicesFor = (task: Task) =>
    reviewerOptions.filter(
      (u) => u.id !== currentUserId && isEligibleReviewer({ role: u.firmRole, userId: u.id, assigneeId: task.assignee?.id ?? currentUserId }),
    );

  const plainStatusTargets: { status: TaskStatus; label: string }[] = [
    { status: TaskStatus.TODO, label: d.todos.columnTodo },
    { status: TaskStatus.IN_PROGRESS, label: d.todos.columnInProgress },
    { status: TaskStatus.DONE, label: d.todos.columnDone },
  ];

  const renderTask = (task: Task) => {
        const isAssignee = task.assignee?.id === currentUserId;
        const canSetPlainStatus = (isAssignee || !task.assignee) && task.status !== TaskStatus.PENDING_REVIEW;
        const reviewer = effectiveReviewerId(task, caseLeadId);
        const canHandoff =
          enableHandoff &&
          (isAssignee || !task.assignee) &&
          reviewer !== currentUserId &&
          handoffSourceStatuses.includes(task.status);
        const canReview =
          enableHandoff &&
          canActOnReview(
            { status: task.status, reviewerId: task.reviewerId, assigneeId: task.assignee?.id, caseId: task.caseId ?? null, leadLawyerId: task.case?.leadLawyerId ?? caseLeadId },
            currentUserId,
            currentUserRole,
          );
        const shownLabels = visibleTaskLabels(task.labels);
        const stageChip = taskStageChip(task.labels);
        const handoffLabel = reviewerNameOf(task, null) ?? reviewerName;
        // Case tasks go to the named reviewer or the case lead; only standalone work needs a pick.
        const pickReviewer = requireReviewerOnHandoff && !task.caseId;
        const priorityBar =
          task.priority === TaskPriority.HIGH
            ? 'border-l-4 border-l-destructive'
            : task.priority === TaskPriority.LOW
              ? 'border-l-4 border-l-muted-foreground/30'
              : '';
        const counters = [
          task.subtaskCount ? { key: 'sub', Icon: ListChecks, label: d.taskDetail.subtasks, value: `${task.subtaskDoneCount ?? 0}/${task.subtaskCount}` } : null,
          task.attachmentCount ? { key: 'att', Icon: Paperclip, label: d.taskDetail.attachments, value: String(task.attachmentCount) } : null,
          task.commentCount ? { key: 'com', Icon: MessageSquare, label: d.taskDetail.comments, value: String(task.commentCount) } : null,
        ].filter((c): c is NonNullable<typeof c> => c !== null);

        return (
          <div
            key={task.id}
            draggable={canSetPlainStatus}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              setDragTaskId(task.id);
            }}
            onDragEnd={() => {
              setDragTaskId(null);
              setDragOverStatus(null);
            }}
            className={`rounded-lg border bg-card p-3 ${priorityBar} ${canSetPlainStatus ? 'cursor-grab active:cursor-grabbing' : ''} ${dragTaskId === task.id ? 'opacity-50' : ''}`}
          >
            {onOpen ? (
              <button
                type="button"
                onClick={() => onOpen(task.id)}
                className="min-h-11 text-left text-sm font-medium text-foreground hover:text-primary hover:underline sm:min-h-0"
              >
                {task.title}
              </button>
            ) : (
              <p className="text-sm font-medium text-foreground">{task.title}</p>
            )}
            {showCaseContext && task.case && (
              <p className="mt-1 text-xs text-muted-foreground">{caseReferenceLabel(task.case)} · {task.case.title}</p>
            )}
            {(stageChip || isHeld(task)) && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {stageChip && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{stageChip}</span>}
                {isHeld(task) && <Badge variant="warning" className="py-0.5 text-[11px]" title={task.onHold?.reason}>{d.todos.heldBadge}</Badge>}
              </div>
            )}
            {canReview && task.status === TaskStatus.PENDING_REVIEW && (
              <p className="mt-1 text-xs text-muted-foreground">{d.todos.openToReview}</p>
            )}
            {shownLabels.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {shownLabels.slice(0, 3).map((label) => (
                  <span key={label} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {label}
                  </span>
                ))}
                {shownLabels.length > 3 && (
                  <span className="text-[11px] text-muted-foreground">+{shownLabels.length - 3}</span>
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
              <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {counters.map(({ key, Icon, label, value }) => (
                  <span key={key} className="inline-flex items-center gap-1 tabular-nums" title={label}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{label}</span>
                    {value}
                  </span>
                ))}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1">
              {canSetPlainStatus &&
                plainStatusTargets
                  .filter((c) => c.status !== task.status && !(task.requiresReview && c.status === TaskStatus.DONE))
                  .map((c) => (
                    <button
                      key={c.status}
                      type="button"
                      onClick={() => onStatusChange(task.id, c.status)}
                      className={`${act} text-muted-foreground hover:bg-accent hover:text-accent-foreground`}
                    >
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      {c.label}
                    </button>
                  ))}
              {canHandoff && onHandoff && (
                <button
                  onClick={() => {
                    setHandoffTaskId(task.id);
                    setHandoffNote('');
                    setHandoffReviewerId(task.reviewerId ?? '');
                  }}
                  type="button"
                  className={`${act} border-primary/40 text-primary hover:bg-primary/10`}
                >
                  {handoffLabel
                    ? fmt(d.todos.handoffToReviewer, { name: handoffLabel })
                    : d.todos.handoffToSenior}
                </button>
              )}
              {canReview && onAccept && (
                <button
                  onClick={() => runAction(task.id, () => onAccept(task.id), () => undefined)}
                  type="button"
                  className={`${act} border-success/40 text-success hover:bg-success/10`}
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
                  type="button"
                  className={`${act} border-destructive/40 text-destructive hover:bg-destructive/10`}
                >
                  {d.todos.reject}
                </button>
              )}
            </div>

            {handoffTaskId === task.id && onHandoff && (
              <div className="mt-3 space-y-2 border-t pt-2">
                {pickReviewer && reviewerLoadError && (
                  <div className="flex items-center justify-between gap-2">
                    <p role="alert" className="text-xs text-destructive">{reviewerLoadError}</p>
                    {onRetryReviewers && (
                      <button
                        type="button"
                        onClick={onRetryReviewers}
                        className={`${act} text-muted-foreground`}
                      >
                        {d.common.retry}
                      </button>
                    )}
                  </div>
                )}
                {pickReviewer && !reviewerLoadError && reviewerChoicesFor(task).length === 0 && (
                  <p className="text-xs text-muted-foreground">{d.todos.noReviewers}</p>
                )}
                {pickReviewer && !reviewerLoadError && reviewerChoicesFor(task).length > 0 && (
                  <select
                    value={handoffReviewerId}
                    disabled={!!task.reviewerId}
                    onChange={(e) => setHandoffReviewerId(e.target.value)}
                    aria-label={d.todos.handoffReviewerPlaceholder}
                    className={field}
                  >
                    <option value="">{d.todos.handoffReviewerPlaceholder}</option>
                    {reviewerChoicesFor(task).map((u) => (
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
                  aria-label={d.todos.handoffNotePlaceholder}
                  className={field}
                />
                {handoffNote && handoffNoteError(handoffNote) && (
                  <p className="text-xs text-muted-foreground">{handoffNoteError(handoffNote)}</p>
                )}
                <div className="flex gap-2">
                  <button
                    disabled={(pickReviewer && !handoffReviewerId) || !!handoffNoteError(handoffNote)}
                    onClick={() =>
                      runAction(
                        task.id,
                        () =>
                          onHandoff(
                            task.id,
                            handoffNote.trim(),
                            pickReviewer ? handoffReviewerId : undefined,
                          ),
                        () => setHandoffTaskId(null),
                      )
                    }
                    type="button"
                    className={`${act} border-primary bg-primary text-primary-foreground hover:bg-primary/90`}
                  >
                    {d.todos.handoffSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHandoffTaskId(null)}
                    className={`${act} text-muted-foreground`}
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
                  aria-label={d.todos.rejectReasonPlaceholder}
                  className={field}
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
                    type="button"
                    className={`${act} border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90`}
                  >
                    {d.todos.rejectSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectTaskId(null)}
                    className={`${act} text-muted-foreground`}
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
                <Badge variant="muted">{statusLabels[task.status] ?? task.status}</Badge>
                {overdue && <Badge variant="destructive">{d.todos.overdue}</Badge>}
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
            onDragOver={(e) => {
              if (!dragTaskId || !DROPPABLE_STATUSES.includes(col.status)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDragOverStatus(col.status);
            }}
            onDragLeave={() => setDragOverStatus((cur) => (cur === col.status ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              const id = dragTaskId;
              setDragTaskId(null);
              setDragOverStatus(null);
              if (!id || !DROPPABLE_STATUSES.includes(col.status)) return;
              const task = tasks.find((t) => t.id === id);
              if (task && task.status !== col.status && task.status !== TaskStatus.PENDING_REVIEW && !(task.requiresReview && col.status === TaskStatus.DONE)) onStatusChange(id, col.status);
            }}
            className={`rounded-xl border bg-muted/40 ${col.color} border-t-4 transition ${dragOverStatus === col.status && dragTaskId ? 'ring-2 ring-primary/60 bg-primary/5' : ''}`}
          >
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                {col.label}
                <span className="ml-2 rounded-full bg-card px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
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
