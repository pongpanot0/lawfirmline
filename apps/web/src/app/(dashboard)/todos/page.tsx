'use client';

import { Suspense, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { TaskPriority, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { useTaskParam } from '@/components/tasks/useTaskParam';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { applyTaskFilters, collectTaskLabels, EMPTY_TASK_FILTERS, hasActiveTaskFilters, TaskFilters } from '@/lib/task-filters';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { priorityLabel } from '@/lib/task-detail';
import { PageLoading } from '@/components/ui/misc';

function TodosPageContent() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [usersLoadError, setUsersLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [layout, setLayout] = useTaskLayout();
  const [scope, setScope] = useState<'mine' | 'team' | 'review'>('mine');
  const taskParam = useTaskParam();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);

  const loadTasks = () => {
    if (!token) return;
    setLoadError('');
    api
      .getMyTodos(token)
      .then((items) => setTasks(items))
      // A failed load must not read as "nothing to do" — that is the one
      // wrong answer a task list can give.
      .catch(() => setLoadError(d.todos.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [token]);

  /**
   * The firm's lawyers, not the admin-only user directory: every member may
   * pick a reviewer or assignee from their own firm. A failed load is kept
   * apart from "nobody to pick" so an empty dropdown never goes unexplained.
   */
  const loadUsers = () => {
    if (!token) return;
    setUsersLoadError('');
    api
      .getLawyers(token)
      .then(setUsers)
      .catch(() => setUsersLoadError(d.todos.reviewersLoadFailed));
  };

  useEffect(() => {
    loadUsers();
  }, [token]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token) return;
    setError('');
    try {
      await api.updateTodo(token, taskId, { status });
      loadTasks();
    } catch {
      setError(d.todos.actionFailed);
    }
  };

  // Handoff/review failures are reported by the board on the task itself,
  // where the form that failed still is; so these rethrow rather than catch.
  const handleHandoff = async (taskId: string, note: string, reviewerId?: string) => {
    if (!token || !reviewerId) return;
    await api.handoffTodo(token, taskId, { reviewerId, note: note || undefined });
    loadTasks();
  };

  const handleAccept = async (taskId: string) => {
    if (!token) return;
    await api.acceptTodo(token, taskId);
    loadTasks();
  };

  const handleReject = async (taskId: string, reason: string) => {
    if (!token) return;
    await api.rejectTodo(token, taskId, { reason });
    loadTasks();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newTitle.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await api.createTodo(token, {
        title: newTitle.trim(),
        assigneeId: newAssigneeId || undefined,
        dueDate: newDueDate || undefined,
        priority: newPriority,
      });
      setNewTitle('');
      setNewAssigneeId('');
      setNewDueDate('');
      setNewPriority(TaskPriority.MEDIUM);
      setShowForm(false);
      loadTasks();
    } catch {
      // Keep what was typed: the retry should not start from a blank field.
      setError(d.todos.createFailed);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageLoading title={d.todos.loading} lines={4} />;

  /**
   * An owner or senior is served the team's personal tasks too. The page then
   * says which set is on screen instead of calling everything "mine".
   */
  const seesOthers = tasks.some((t) => t.assignee && t.assignee.id !== user?.id);
  const scopedTasks = !seesOthers
    ? tasks
    : scope === 'team'
      ? tasks
      : scope === 'review'
        ? tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW && t.assignee?.id === user?.id)
        : tasks.filter((t) => !t.assignee || t.assignee.id === user?.id);
  const visibleTasks = applyTaskFilters(scopedTasks, filters);
  const filtering = hasActiveTaskFilters(filters);
  const scopes: { key: typeof scope; label: string }[] = [
    { key: 'mine', label: d.todos.scopeMine },
    { key: 'team', label: d.todos.scopeTeam },
    { key: 'review', label: d.todos.scopeReview },
  ];

  return (
    <div>
      <PageHeader
        title={seesOthers && scope === 'team' ? d.todos.titleTeam : d.todos.title}
        description={d.todos.description}
        actions={
          <div className="flex items-center gap-2">
            {seesOthers && (
              <div role="tablist" aria-label={d.todos.title} className="flex rounded-lg border border-border p-0.5">
                {scopes.map((s) => (
                  <button
                    key={s.key}
                    role="tab"
                    type="button"
                    aria-selected={scope === s.key}
                    onClick={() => setScope(s.key)}
                    className={`rounded-md px-2.5 py-1 text-xs ${scope === s.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            <TaskViewToggle layout={layout} onChange={setLayout} />
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4" />
              {d.todos.addTodo}
            </Button>
          </div>
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="mb-4">
        <CardContent className="p-3">
          <TaskFilterBar
            value={filters}
            onChange={setFilters}
            users={users}
            labels={collectTaskLabels(scopedTasks)}
            statuses={[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW, TaskStatus.NEEDS_REVISION, TaskStatus.DONE]}
            shown={visibleTasks.length}
            total={scopedTasks.length}
          />
        </CardContent>
      </Card>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-3">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={d.todos.titlePlaceholder}
                className="min-w-[200px] flex-1"
                required
              />
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">{d.todos.assignToMe}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              />
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                aria-label={d.todos.priority}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
                  <option key={p} value={p}>{priorityLabel(d, p)}</option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={creating}>{d.todos.create}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {loadError ? (
        <div className="rounded-xl border bg-card p-6 shadow-soft">
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadTasks}>
            {d.common.retry}
          </Button>
        </div>
      ) : (
      <>
      {filtering && visibleTasks.length === 0 && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">{d.todos.noMatches}</p>
      )}
      <KanbanBoard
        layout={layout}
        tasks={visibleTasks}
        onStatusChange={handleStatusChange}
        currentUserId={user?.id ?? ''}
        enableHandoff
        requireReviewerOnHandoff
        reviewerOptions={users}
        reviewerLoadError={usersLoadError}
        onRetryReviewers={loadUsers}
        onHandoff={handleHandoff}
        onAccept={handleAccept}
        onReject={handleReject}
        onOpen={taskParam.open}
      />
      </>
      )}
      <TaskDetailDrawer
        taskId={taskParam.taskId}
        users={users}
        onClose={taskParam.close}
        onChanged={loadTasks}
        onNavigate={taskParam.open}
      />
    </div>
  );
}

export default function TodosPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<PageLoading title={d.todos.loading} lines={4} />}>
      <TodosPageContent />
    </Suspense>
  );
}
