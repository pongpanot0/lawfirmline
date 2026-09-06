'use client';

import { useState } from 'react';
import { TaskStatus } from '@lawfirm/shared';
import { formatDate } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  assignee?: { id: string; firstName: string; lastName: string } | null;
}

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  currentUserId: string;
  isReviewer?: boolean;
  /** Case-bound tasks only: the lawyer↔senior handoff/review pipeline. */
  enableHandoff?: boolean;
  onHandoff?: (taskId: string, note: string, reviewerId?: string) => void;
  onAccept?: (taskId: string) => void;
  onReject?: (taskId: string, reason: string) => void;
  /** Standalone tasks only: no fixed senior lawyer, so the sender picks a reviewer at handoff time. */
  requireReviewerOnHandoff?: boolean;
  reviewerOptions?: { id: string; firstName: string; lastName: string }[];
}

const HANDOFF_SOURCE_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.NEEDS_REVISION,
];

export function KanbanBoard({
  tasks,
  onStatusChange,
  currentUserId,
  isReviewer = false,
  enableHandoff = false,
  onHandoff,
  onAccept,
  onReject,
  requireReviewerOnHandoff = false,
  reviewerOptions = [],
}: KanbanBoardProps) {
  const d = useDashboardT();
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

  const plainStatusTargets: { status: TaskStatus; label: string }[] = [
    { status: TaskStatus.TODO, label: d.todos.columnTodo },
    { status: TaskStatus.IN_PROGRESS, label: d.todos.columnInProgress },
    { status: TaskStatus.DONE, label: d.todos.columnDone },
  ];

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
              {colTasks.map((task) => {
                const isAssignee = task.assignee?.id === currentUserId;
                const canSetPlainStatus = isAssignee || !task.assignee;
                const canHandoff =
                  enableHandoff && isAssignee && HANDOFF_SOURCE_STATUSES.includes(task.status);
                const canReview =
                  enableHandoff &&
                  task.status === TaskStatus.PENDING_REVIEW &&
                  (isReviewer || isAssignee);

                return (
                  <div
                    key={task.id}
                    className="rounded-lg border bg-card p-3 shadow-soft"
                  >
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
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
                          {d.todos.handoffToSenior}
                        </button>
                      )}
                      {canReview && onAccept && (
                        <button
                          onClick={() => onAccept(task.id)}
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
                        {requireReviewerOnHandoff && (
                          <select
                            value={handoffReviewerId}
                            onChange={(e) => setHandoffReviewerId(e.target.value)}
                            className="w-full rounded border px-2 py-1 text-xs"
                          >
                            <option value="">{d.todos.handoffReviewerPlaceholder}</option>
                            {reviewerOptions
                              .filter((u) => u.id !== currentUserId)
                              .map((u) => (
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
                            onClick={() => {
                              onHandoff(
                                task.id,
                                handoffNote,
                                requireReviewerOnHandoff ? handoffReviewerId : undefined,
                              );
                              setHandoffTaskId(null);
                            }}
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
                              onReject(task.id, rejectReason.trim());
                              setRejectTaskId(null);
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
                  </div>
                );
              })}
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
