'use client';

import { CasePlaybook } from './CasePlaybook';
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FirmRole, TaskPriority, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { useTaskParam } from '@/components/tasks/useTaskParam';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { applyTaskFilters, collectTaskLabels, EMPTY_TASK_FILTERS, hasActiveTaskFilters, TaskFilters } from '@/lib/task-filters';
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
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const visibleTasks = applyTaskFilters(tasks, filters);
  const filtering = hasActiveTaskFilters(filters);

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
      <CasePlaybook caseId={caseId} onApplied={loadTasks} />
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
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label={d.caseTasks.addTask}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !creating) {
              event.stopPropagation();
              setShowForm(false);
            }
          }}
        >
          <div className="absolute inset-0 bg-black/30" onClick={() => { if (!creating) setShowForm(false); }} />
          <aside className="relative flex h-dvh w-full max-w-lg flex-col border-l border-border bg-card shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">{d.caseTasks.addTask}</h2>
              <button
                type="button"
                aria-label={d.common.close}
                onClick={() => { if (!creating) setShowForm(false); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form id="create-case-task" onSubmit={handleCreate} className="min-h-0 flex-1 overflow-y-auto p-5">
              <fieldset disabled={creating} className="flex min-w-0 flex-col gap-4">
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <div>
                  <label htmlFor="case-task-title" className="text-sm font-medium">{d.caseTasks.titlePlaceholder}</label>
                  <Input
                    id="case-task-title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    autoFocus
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <label htmlFor="case-task-assignee" className="text-sm font-medium">{d.todos.filterAssignee}</label>
                  <select
                    id="case-task-assignee"
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
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
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="case-task-due" className="text-sm font-medium">{d.caseTasks.dueDate}</label>
                    <input
                      id="case-task-due"
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="case-task-priority" className="text-sm font-medium">{d.todos.priority}</label>
                    <select
                      id="case-task-priority"
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                      className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                    >
                      {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
                        <option key={p} value={p}>{priorityLabel(d, p)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </fieldset>
            </form>
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button variant="outline" onClick={() => { if (!creating) setShowForm(false); }}>{d.common.cancel}</Button>
              <Button form="create-case-task" type="submit" disabled={creating || !newTitle.trim()}>
                {creating ? '…' : d.caseTasks.create}
              </Button>
            </div>
          </aside>
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="p-3">
          <TaskFilterBar
            value={filters}
            onChange={setFilters}
            users={users}
            labels={collectTaskLabels(tasks)}
            statuses={[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW, TaskStatus.NEEDS_REVISION, TaskStatus.DONE]}
            shown={visibleTasks.length}
            total={tasks.length}
          />
        </CardContent>
      </Card>

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
        isReviewer={isReviewer}
        enableHandoff
        handoffAllowed={!isLeadLawyer}
        reviewerName={reviewerName}
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
