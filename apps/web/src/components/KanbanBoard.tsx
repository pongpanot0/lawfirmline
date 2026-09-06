'use client';

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
  assignee?: { firstName: string; lastName: string } | null;
}

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const d = useDashboardT();

  const columns: { status: TaskStatus; label: string; color: string }[] = [
    { status: TaskStatus.TODO, label: d.todos.columnTodo, color: 'border-t-muted-foreground/40' },
    { status: TaskStatus.IN_PROGRESS, label: d.todos.columnInProgress, color: 'border-t-amber-400' },
    { status: TaskStatus.DONE, label: d.todos.columnDone, color: 'border-t-emerald-400' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
              {colTasks.map((task) => (
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
                    {columns
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
                  </div>
                </div>
              ))}
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
