'use client';

import { TaskPriority, TaskStatus } from '@lawfirm/shared';
import { UserItem } from '@/lib/api';
import { priorityLabel } from '@/lib/task-detail';
import { EMPTY_TASK_FILTERS, hasActiveTaskFilters, TaskDueFilter, TaskFilters } from '@/lib/task-filters';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDashboardT } from '@/components/landing/LocaleProvider';

interface Props {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  users: UserItem[];
  labels: string[];
  /** Review states only exist on boards with the handoff pipeline. */
  statuses: TaskStatus[];
  /** Shown as "n of m" so a filtered-empty board is not mistaken for no work. */
  shown: number;
  total: number;
}

export function TaskFilterBar({ value, onChange, users, labels, statuses, shown, total }: Props) {
  const d = useDashboardT();
  const set = <K extends keyof TaskFilters>(key: K, next: TaskFilters[K]) =>
    onChange({ ...value, [key]: next });
  const select = 'h-9 rounded-lg border border-input bg-card px-3 text-sm';
  const statusLabel: Record<TaskStatus, string> = {
    [TaskStatus.TODO]: d.todos.columnTodo,
    [TaskStatus.IN_PROGRESS]: d.todos.columnInProgress,
    [TaskStatus.PENDING_REVIEW]: d.todos.columnPendingReview,
    [TaskStatus.NEEDS_REVISION]: d.todos.columnNeedsRevision,
    [TaskStatus.DONE]: d.todos.columnDone,
  };
  const dueOptions: { value: TaskDueFilter; label: string }[] = [
    { value: '', label: d.todos.filterDueAny },
    { value: 'overdue', label: d.todos.overdue },
    { value: 'today', label: d.todos.filterDueToday },
    { value: 'week', label: d.todos.filterDueWeek },
    { value: 'none', label: d.todos.filterDueNone },
  ];
  const active = hasActiveTaskFilters(value);

  return (
    <div role="search" aria-label={d.todos.filters} className="flex flex-wrap items-center gap-2">
      <Input
        value={value.search}
        onChange={(e) => set('search', e.target.value)}
        placeholder={d.todos.filterSearch}
        aria-label={d.todos.filterSearch}
        className="h-9 w-full sm:w-48"
      />
      <select value={value.status} onChange={(e) => set('status', e.target.value)} aria-label={d.todos.filterStatus} className={select}>
        <option value="">{d.todos.filterStatus}</option>
        {statuses.map((s) => (
          <option key={s} value={s}>{statusLabel[s]}</option>
        ))}
      </select>
      <select value={value.priority} onChange={(e) => set('priority', e.target.value)} aria-label={d.todos.priority} className={select}>
        <option value="">{d.todos.priority}</option>
        {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
          <option key={p} value={p}>{priorityLabel(d, p)}</option>
        ))}
      </select>
      <select value={value.assigneeId} onChange={(e) => set('assigneeId', e.target.value)} aria-label={d.todos.filterAssignee} className={select}>
        <option value="">{d.todos.filterAssignee}</option>
        <option value="unassigned">{d.taskDetail.unassigned}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
        ))}
      </select>
      {labels.length > 0 && (
        <select value={value.label} onChange={(e) => set('label', e.target.value)} aria-label={d.taskDetail.labels} className={select}>
          <option value="">{d.taskDetail.labels}</option>
          {labels.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      )}
      <select value={value.due} onChange={(e) => set('due', e.target.value as TaskDueFilter)} aria-label={d.todos.filterDue} className={select}>
        {dueOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.value ? o.label : d.todos.filterDue}</option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground" aria-live="polite">
        {active ? `${shown}/${total}` : total}
      </span>
      {active && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_TASK_FILTERS)}>
          {d.todos.clearFilters}
        </Button>
      )}
    </div>
  );
}
