'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { FirmRole, TaskPriority, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { useTaskParam } from '@/components/tasks/useTaskParam';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { priorityLabel } from '@/lib/task-detail';

export function CaseTasksPanel({ caseId }: { caseId: string }) {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [layout, setLayout] = useTaskLayout();
  const taskParam = useTaskParam();

  const loadTasks = () => {
    if (!token || !caseId) return;
    setLoadError('');
    api
      .getTasks(token, caseId)
      .then(setTasks)
      // A failed load must not read as "nothing to do".
      .catch(() => setLoadError(d.todos.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [token, caseId]);

  useEffect(() => {
    if (!token || !caseId) return;
    api.getCase(token, caseId).then(setCaseDetail).catch(console.error);
  }, [token, caseId]);

  useEffect(() => {
    if (!token) return;
    // The firm's lawyers, not the admin-only user directory.
    api.getLawyers(token).then(setUsers).catch(console.error);
  }, [token]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token || !caseId) return;
    setError('');
    try {
      await api.updateTask(token, caseId, taskId, { status });
      loadTasks();
    } catch {
      setError(d.caseTasks.updateFailed);
    }
  };

  const handleHandoff = async (taskId: string, note: string) => {
    if (!token || !caseId) return;
    await api.handoffTask(token, caseId, taskId, { note: note || undefined });
    loadTasks();
  };

  const handleAccept = async (taskId: string) => {
    if (!token || !caseId) return;
    await api.acceptTask(token, caseId, taskId);
    loadTasks();
  };

  const handleReject = async (taskId: string, reason: string) => {
    if (!token || !caseId) return;
    await api.rejectTask(token, caseId, taskId, { reason });
    loadTasks();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !caseId || !newTitle.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await api.createTask(token, caseId, {
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
      // What was typed stays, so the retry is one click.
      setError(d.caseTasks.createFailed);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageLoading title={d.caseTasks.loading} lines={3} />;

  const isLeadLawyer = !!user && user.id === caseDetail?.leadLawyer?.id;
  const isReviewer = !!user && (user.firmRole === FirmRole.OWNER || isLeadLawyer);
  const leadLawyer = caseDetail?.leadLawyer;
  const reviewerName = leadLawyer ? `${leadLawyer.firstName} ${leadLawyer.lastName}` : undefined;

  /**
   * The people already on this case come first: a task on a case is nearly
   * always for someone working it, and the whole firm is a long list to read
   * past. Everyone else stays reachable underneath.
   */
  const caseTeamIds = new Set(
    [
      caseDetail?.leadLawyer?.id,
      ...(caseDetail?.assignments ?? []).map((assignment) => assignment.user.id),
    ].filter(Boolean) as string[],
  );
  const caseTeam = users.filter((member) => caseTeamIds.has(member.id));
  const others = users.filter((member) => !caseTeamIds.has(member.id));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">{d.caseTasks.title}</h2>
        <div className="flex items-center gap-2">
          <TaskViewToggle layout={layout} onChange={setLayout} />
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {d.caseTasks.addTask}
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-3">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={d.caseTasks.titlePlaceholder}
                className="min-w-[200px] flex-1"
                required
              />
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">{d.caseTasks.assignToMe}</option>
                {caseTeam.length > 0 && (
                  <optgroup label={d.caseTasks.caseTeam}>
                    {caseTeam.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label={d.caseTasks.otherMembers}>
                    {others.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <input
                type="date"
                aria-label={d.caseTasks.dueDate}
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
              <Button type="submit" size="sm" disabled={creating}>{d.caseTasks.create}</Button>
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
        isReviewer={isReviewer}
        enableHandoff
        handoffAllowed={!isLeadLawyer}
        reviewerName={reviewerName}
        onHandoff={handleHandoff}
        onAccept={handleAccept}
        onReject={handleReject}
        onOpen={taskParam.open}
      />
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
