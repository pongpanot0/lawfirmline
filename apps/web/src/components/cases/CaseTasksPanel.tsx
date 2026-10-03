'use client';

import { CasePlaybook } from './CasePlaybook';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { useLeaveFlags } from '@/lib/use-leave-flags';
import { leaveWarning } from '@/lib/leave-flags';
import { bangkokDateInputValue } from '@/lib/bangkok';

export function CaseTasksPanel({ caseId, onTasksChanged }: { caseId: string; onTasksChanged?: (tasks: TaskItem[]) => void }) {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const createRequested = searchParams.get('newTask') === '1';
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newObserverIds, setNewObserverIds] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [newRequiresReview, setNewRequiresReview] = useState(false);
  const [newReviewerId, setNewReviewerId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [layout, setLayout] = useTaskLayout();
  const taskParam = useTaskParam();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const visibleTasks = applyTaskFilters(tasks, filters);
  const filtering = hasActiveTaskFilters(filters);
  const newTaskDate = newDueDate || bangkokDateInputValue(new Date());
  const newTaskLeaveFlags = useLeaveFlags(token, newTaskDate);

  useEffect(() => {
    if (!createRequested) return;
    setShowForm(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('newTask');
    next.delete('task');
    router.replace(`/cases/${caseId}?${next.toString()}`, { scroll: false });
  }, [createRequested, searchParams, router, caseId]);

  const loadTasks = () => {
    if (!token || !caseId) return;
    setLoadError('');
    api
      .getTasks(token, caseId)
      .then(loaded => { setTasks(loaded); onTasksChanged?.(loaded); })
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
      const created = await api.createTask(token, caseId, {
        title: newTitle.trim(),
        assigneeId: newAssigneeId || user?.id,
        dueDate: newDueDate || undefined,
        priority: newPriority,
        observerIds: newObserverIds.length > 0 ? newObserverIds : undefined,
        ...(newRequiresReview ? { requiresReview: true, reviewerId: newReviewerId } : {}),
      });
      setNewTitle('');
      setNewAssigneeId('');
      setNewObserverIds([]);
      setNewDueDate('');
      setNewPriority(TaskPriority.MEDIUM);
      setNewRequiresReview(false);
      setNewReviewerId('');
      setShowForm(false);
      loadTasks();
      taskParam.open(created.id);
    } catch (err) {
      // What was typed stays, so the retry is one click.
      setError(err instanceof Error ? err.message : d.caseTasks.createFailed);
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
  const newAssigneeUser = users.find((u) => u.id === newAssigneeId);
  const reviewers = users.filter(member => member.id !== (newAssigneeId || user?.id) && (member.firmRole === FirmRole.OWNER || member.firmRole === FirmRole.SENIOR_LAWYER));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-xl border bg-card px-4 py-3">
        <div>
          <h2 className="font-semibold tracking-tight text-foreground">{d.caseTasks.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">งานที่สร้างและมอบหมายในคดีนี้</p>
        </div>
        <div className="flex items-center gap-2">
          <TaskViewToggle layout={layout} onChange={setLayout} />
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />
            {d.caseTasks.addTask}
          </Button>
        </div>
      </div>

      <div className="mb-4"><CasePlaybook caseId={caseId} caseTypeId={caseDetail?.caseType?.id} initialReleaseId={searchParams.get('sop') ?? ''} onApplied={loadTasks} /></div>

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
            <form id="create-case-task" onSubmit={handleCreate} onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }} className="min-h-0 flex-1 overflow-y-auto p-5">
              <fieldset disabled={creating} className="flex min-w-0 flex-col gap-4">
                {caseDetail && <p className="break-words text-sm text-muted-foreground">งานในคดี: {caseDetail.title}</p>}
                <p className="text-xs text-muted-foreground">เริ่มจากชื่องานได้ ผู้รับผิดชอบเริ่มที่คุณ และกำหนดส่งเติมภายหลังได้</p>
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <div>
                  <label htmlFor="case-task-title" className="text-sm font-medium">{d.taskDetail.titleField} *</label>
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
                  <label htmlFor="case-task-assignee" className="text-sm font-medium">{d.taskDetail.assignee}</label>
                  <select
                    id="case-task-assignee"
                    value={newAssigneeId}
                    onChange={(e) => { setNewAssigneeId(e.target.value); if ((e.target.value || user?.id) === newReviewerId) setNewReviewerId(''); }}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    <option value="">{d.caseTasks.assignToMe}</option>
                    {caseTeam.length > 0 && (
                      <optgroup label={d.caseTasks.caseTeam}>
                        <AssigneeOptions users={caseTeam} flags={newTaskLeaveFlags} />
                      </optgroup>
                    )}
                    {others.length > 0 && (
                      <optgroup label={d.caseTasks.otherMembers}>
                        <AssigneeOptions users={others} flags={newTaskLeaveFlags} />
                      </optgroup>
                    )}
                  </select>
                  {newAssigneeUser && newTaskLeaveFlags.has(newAssigneeId) && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {leaveWarning(
                        `${newAssigneeUser.firstName} ${newAssigneeUser.lastName}`,
                        newTaskDate,
                        newTaskLeaveFlags.get(newAssigneeId)?.kind,
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="case-task-due" className="text-sm font-medium">{d.caseTasks.dueDate}</label>
                  <Input
                    id="case-task-due"
                    type="date"
                    value={newDueDate}
                    onChange={event => setNewDueDate(event.target.value)}
                    className="mt-1"
                  />
                </div>
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium">การตรวจงาน / ความสำคัญ / ผู้ติดตาม (ถ้ามี)</summary>
                  <label className="mt-3 flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" checked={newRequiresReview} onChange={event => { setNewRequiresReview(event.target.checked); setNewReviewerId(reviewers.find(member => member.id === caseDetail?.leadLawyer?.id)?.id ?? ''); }} />
                    ต้องให้ผู้ตรวจยืนยันก่อนปิดงาน
                  </label>
                  {newRequiresReview && <div className="mt-3">
                    <label htmlFor="case-task-reviewer" className="text-sm font-medium">ผู้ตรวจ *</label>
                    <select id="case-task-reviewer" required value={newReviewerId} onChange={event => setNewReviewerId(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm">
                      <option value="">เลือกผู้ตรวจ</option>
                      {reviewers.map(member => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
                    </select>
                    {!reviewers.length && <p className="mt-1 text-xs text-muted-foreground">ต้องมีเจ้าของสำนักงานหรือทนายอาวุโสอีกคนเป็นผู้ตรวจ</p>}
                  </div>}
                  <div className="mt-3">
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
                <div className="mt-3">
                  <label className="text-sm font-medium">{d.taskDetail.observers || 'ผู้ติดตาม'}</label>
                  <div className="mt-1">
                    <MultiUserSelect
                      users={users}
                      value={newObserverIds}
                      onChange={setNewObserverIds}
                      placeholder={d.taskDetail.observersPlaceholder || 'เลือกผู้ติดตาม'}
                    />
                  </div>
                </div>
                </details>
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
