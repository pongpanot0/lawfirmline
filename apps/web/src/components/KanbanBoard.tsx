'use client';

import { TaskStatus } from '@lawfirm/shared';

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

const columns: { status: TaskStatus; label: string; color: string }[] = [
  { status: TaskStatus.TODO, label: 'To Do', color: 'border-t-slate-400' },
  { status: TaskStatus.IN_PROGRESS, label: 'In Progress', color: 'border-t-amber-400' },
  { status: TaskStatus.DONE, label: 'Done', color: 'border-t-green-400' },
];

export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {columns.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div
            key={col.status}
            className={`rounded-xl border border-slate-200 bg-slate-50 ${col.color} border-t-4`}
          >
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-700">
                {col.label}
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">
                  {colTasks.length}
                </span>
              </h3>
            </div>
            <div className="space-y-3 p-3">
              {colTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <p className="text-sm font-medium text-slate-900">{task.title}</p>
                  {task.description && (
                    <p className="mt-1 text-xs text-slate-500">{task.description}</p>
                  )}
                  {task.assignee && (
                    <p className="mt-2 text-xs text-slate-400">
                      {task.assignee.firstName} {task.assignee.lastName}
                    </p>
                  )}
                  {task.dueDate && (
                    <p className="mt-1 text-xs text-slate-400">
                      Due: {new Date(task.dueDate).toLocaleDateString()}
                    </p>
                  )}
                  <div className="mt-3 flex gap-1">
                    {columns
                      .filter((c) => c.status !== task.status)
                      .map((c) => (
                        <button
                          key={c.status}
                          onClick={() => onStatusChange(task.id, c.status)}
                          className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          → {c.label}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-400">No tasks</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
