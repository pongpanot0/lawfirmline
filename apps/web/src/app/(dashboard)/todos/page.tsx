'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
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

  const loadTasks = () => {
    if (!token) return;
    api
      .getMyTodos(token)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.getUsers(token).then(setUsers).catch(console.error);
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

  const handleHandoff = async (taskId: string, note: string, reviewerId?: string) => {
    if (!token || !reviewerId) return;
    setError('');
    try {
      await api.handoffTodo(token, taskId, { reviewerId, note: note || undefined });
      loadTasks();
    } catch {
      setError(d.todos.actionFailed);
    }
  };

  const handleAccept = async (taskId: string) => {
    if (!token) return;
    setError('');
    try {
      await api.acceptTodo(token, taskId);
      loadTasks();
    } catch {
      setError(d.todos.actionFailed);
    }
  };

  const handleReject = async (taskId: string, reason: string) => {
    if (!token) return;
    setError('');
    try {
      await api.rejectTodo(token, taskId, { reason });
      loadTasks();
    } catch {
      setError(d.todos.actionFailed);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newTitle) return;
    await api.createTodo(token, {
      title: newTitle,
      assigneeId: newAssigneeId || undefined,
      dueDate: newDueDate || undefined,
    });
    setNewTitle('');
    setNewAssigneeId('');
    setNewDueDate('');
    setShowForm(false);
    loadTasks();
  };

  if (loading) return <p className="text-muted-foreground">{d.todos.loading}</p>;

  return (
    <div>
      <PageHeader
        title={d.todos.title}
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {d.todos.addTodo}
          </Button>
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
              <Button type="submit" size="sm">{d.todos.create}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <KanbanBoard
        tasks={tasks}
        onStatusChange={handleStatusChange}
        currentUserId={user?.id ?? ''}
        enableHandoff
        requireReviewerOnHandoff
        reviewerOptions={users}
        onHandoff={handleHandoff}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    </div>
  );
}
