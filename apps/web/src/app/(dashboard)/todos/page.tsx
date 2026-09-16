'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { canAssignFirmRole, TaskPriority, TaskStatus } from '@lawfirm/shared';
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
  const searchParams = useSearchParams();
  // ?new=1 (the topbar's quick-create) lands with the drawer already open.
  const [showForm, setShowForm] = useState(false);
  useEffect(() => {
    if (searchParams.has('new')) setShowForm(true);
    // ?assignee=<id> (from the workload dashboard) pre-picks who gets the task.
    const assignee = searchParams.get('assignee');
    if (assignee) setNewAssigneeId(assignee);
  }, [searchParams]);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const fmtUploadFailed = (n: number) => `สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ ${n} ไฟล์ — แนบใหม่ได้ในหน้ารายละเอียดงาน`;
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [usersLoadError, setUsersLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [layout, setLayout] = useTaskLayout();
  const [scope, setScope] = useState<'mine' | 'team' | 'review'>('mine');
  const taskParam = useTaskParam();
  // Creating a task for someone else follows the firm hierarchy: only roles
  // below yours (assigning to yourself is the empty default option).
  const assignableUsers = user
    ? users.filter((u) => u.id !== user.id && u.firmRole != null && canAssignFirmRole(user.firmRole, u.firmRole))
    : [];
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
      const created = await api.createTodo(token, {
        title: newTitle.trim(),
        assigneeId: newAssigneeId || undefined,
        dueDate: newDueDate || undefined,
        priority: newPriority,
      });
      // Attachments ride along with the create; a failed file surfaces as a
      // warning on the detail drawer rather than losing the task itself.
      let failedUploads = 0;
      for (const file of newFiles) {
        try {
          await api.uploadTaskAttachment(token, created.id, file);
        } catch {
          failedUploads += 1;
        }
      }
      if (failedUploads > 0) setError(fmtUploadFailed(failedUploads));
      setNewTitle('');
      setNewAssigneeId('');
      setNewDueDate('');
      setNewPriority(TaskPriority.MEDIUM);
      setNewFiles([]);
      setShowForm(false);
      loadTasks();
      // Straight into the detail drawer: subtasks (1-2-3) and the uploaded
      // attachments are there, so the flow continues without re-opening.
      taskParam.open(created.id);
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
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={d.todos.addTodo}>
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowForm(false)} />
          <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-card p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{d.todos.addTodo}</h2>
              <button type="button" aria-label={d.common.close} onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={d.todos.titlePlaceholder}
                autoFocus
                required
              />
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">{d.todos.assignToMe}</option>
                {assignableUsers.map((u) => (
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
              <div>
                <label className="mb-1 block text-sm font-medium">ไฟล์แนบ</label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.txt"
                  onChange={(e) => setNewFiles(Array.from(e.target.files ?? []))}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
                />
                {newFiles.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {newFiles.length} ไฟล์: {newFiles.map((f) => f.name).join(', ')}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={creating}>{d.todos.create}</Button>
            </form>
          </aside>
        </div>
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
