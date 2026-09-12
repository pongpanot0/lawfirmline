/**
 * Board filters for personal and case tasks. The list is already loaded in
 * full, so filtering is done here rather than on the server; every value a
 * task can carry (status, priority, assignee, label, due date) has a filter.
 */
export type TaskDueFilter = '' | 'overdue' | 'today' | 'week' | 'none';

export interface TaskFilters {
  search: string;
  status: string;
  priority: string;
  /** A user id, `'unassigned'`, or `''` for any. */
  assigneeId: string;
  label: string;
  due: TaskDueFilter;
}

export const EMPTY_TASK_FILTERS: TaskFilters = {
  search: '',
  status: '',
  priority: '',
  assigneeId: '',
  label: '',
  due: '',
};

interface FilterableTask {
  title: string;
  status: string;
  priority?: string;
  labels?: string[];
  dueDate?: string | null;
  assignee?: { id: string } | null;
}

export function hasActiveTaskFilters(filters: TaskFilters): boolean {
  return Object.values(filters).some((value) => value !== '');
}

export function collectTaskLabels(tasks: FilterableTask[]): string[] {
  const seen = new Set<string>();
  for (const task of tasks) for (const label of task.labels ?? []) seen.add(label);
  return [...seen].sort((a, b) => a.localeCompare(b, 'th'));
}

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function applyTaskFilters<T extends FilterableTask>(
  tasks: T[],
  filters: TaskFilters,
  now: Date = new Date(),
): T[] {
  const search = filters.search.trim().toLowerCase();
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86400000);
  const weekEnd = new Date(today.getTime() + 8 * 86400000);

  return tasks.filter((task) => {
    if (search && !task.title.toLowerCase().includes(search)) return false;
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.assigneeId === 'unassigned') {
      if (task.assignee) return false;
    } else if (filters.assigneeId && task.assignee?.id !== filters.assigneeId) {
      return false;
    }
    if (filters.label && !(task.labels ?? []).includes(filters.label)) return false;
    if (filters.due) {
      const due = task.dueDate ? new Date(task.dueDate) : null;
      switch (filters.due) {
        case 'none':
          if (due) return false;
          break;
        case 'overdue':
          // Done work is history, not a missed deadline.
          if (!due || task.status === 'DONE' || due >= today) return false;
          break;
        case 'today':
          if (!due || due < today || due >= tomorrow) return false;
          break;
        case 'week':
          if (!due || due < today || due >= weekEnd) return false;
          break;
      }
    }
    return true;
  });
}
