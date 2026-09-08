'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function TodosPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [usersLoadError, setUsersLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [layout, setLayout] = useTaskLayout();

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
      });
      setNewTitle('');
      setNewAssigneeId('');
      setNewDueDate('');
      setShowForm(false);
      loadTasks();
    } catch {
      // Keep what was typed: the retry should not start from a blank field.
      setError(d.todos.createFailed);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">{d.todos.loading}</p>;

  return (
    <div>
      <PageHeader
        title={d.todos.title}
        actions={
          <div className="flex items-center gap-2">
            <TaskViewToggle layout={layout} onChange={setLayout} />
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4" />
              {d.todos.addTodo}
            </Button>
          </div>
        }
      />

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

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
      <KanbanBoard
        layout={layout}
        tasks={tasks}
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
      />
      )}
    </div>
  );
}
