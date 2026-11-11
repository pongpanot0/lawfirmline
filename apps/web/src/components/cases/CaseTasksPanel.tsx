'use client';

import { ThaiDateField } from '@/components/ui/ThaiDateField';
import { CasePlaybook } from './CasePlaybook';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X, AlertTriangle } from 'lucide-react';
import { canDelegateTask, isEligibleReviewer, TaskPriority, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem, UserItem, WorkloadSummary } from '@/lib/api';
import { workloadLabel } from '@/lib/workload-label';
import { caseStageLabel, caseStageOptions } from '@/lib/stage-labels';
import { taskStageGroups } from './task-stage-groups';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { useTaskParam } from '@/components/tasks/useTaskParam';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { applyTaskFilters, collectTaskLabels, EMPTY_TASK_FILTERS, hasActiveTaskFilters, TaskFilters } from '@/lib/task-filters';
import { Button } from '@/components/ui/button';
import { UndoToast, type UndoAction } from '@/components/ui/UndoToast';
import { CaseTaskListV2 } from '@/components/case-page/CaseTaskListV2';
import v2 from '@/components/case-page/v2.module.css';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
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
  const [undo, setUndo] = useState<UndoAction | null>(null);
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
  const [newDescription, setNewDescription] = useState('');
  const [newRequiresAttachment, setNewRequiresAttachment] = useState(false);
  const [newStage, setNewStage] = useState<string | null>(null);
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [layout, setLayout] = useTaskLayout();
  const taskParam = useTaskParam();
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const visibleTasks = applyTaskFilters(tasks, filters);
  const filtering = hasActiveTaskFilters(filters);
  const stageGroups = taskStageGroups(visibleTasks, caseDetail?.stage);
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
    api.getWorkloadSummary(token).then(setWorkload).catch(() => setWorkload([]));
  }, [token]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token || !caseId) return;
    setError('');
    try {
      const previous = tasks.find(task => task.id === taskId);
      await api.updateTask(token, caseId, taskId, { status });
      if (status === TaskStatus.DONE && previous && previous.status !== TaskStatus.DONE) {
        const next = tasks.find(task => task.id !== taskId && task.status !== TaskStatus.DONE);
        setUndo({ message: `ทำเสร็จแล้ว: ${previous.title}`, detail: next ? `งานถัดไป: ${next.title}` : undefined, undo: async () => { await api.updateTask(token, caseId, taskId, { status: previous.status }); loadTasks(); } });
      }
      loadTasks();
    } catch {
      setError(d.caseTasks.updateFailed);
    }
  };

  const handleHandoff = async (taskId: string, note: string) => {
    if (!token || !caseId) return;
    await api.handoffTask(token, caseId, taskId, { note });
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

  const handleCreate = async (e?: React.FormEvent, keepOpen = false) => {
    e?.preventDefault();
    if (!token || !caseId || !newTitle.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const created = await api.createTask(token, caseId, {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        requiresAttachment: newRequiresAttachment || undefined,
        assigneeId: newAssigneeId || user?.id,
        dueDate: newDueDate || undefined,
        priority: newPriority,
        labels: (newStage ?? caseDetail?.stage) ? [`stage:${newStage ?? caseDetail?.stage}`] : undefined,
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
      setNewDescription('');
      setNewRequiresAttachment(false);
      setNewStage(null);
      if (keepOpen) {
        loadTasks();
        document.getElementById('case-task-title')?.focus();
        return;
      }
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
  const canGive = (member: UserItem) => member.id === user?.id || (!!user && member.firmRole != null && canDelegateTask(user.firmRole, member.firmRole));
  const caseTeam = users.filter((member) => caseTeamIds.has(member.id) && canGive(member));
  const others = users.filter((member) => !caseTeamIds.has(member.id) && canGive(member));
  const assigneeName = (u: { id: string; firstName: string; lastName?: string }) => `${u.firstName} ${u.lastName ?? ''}${workloadLabel(workload.find((w) => w.userId === u.id))}`;
  const newAssigneeUser = users.find((u) => u.id === newAssigneeId);
  const reviewers = users.filter((member) => isEligibleReviewer({
    role: member.firmRole, userId: member.id, caseLeadId: caseDetail?.leadLawyer?.id, assigneeId: newAssigneeId || user?.id,
  }));

  return (
    <div>
      <UndoToast action={undo} onDismiss={() => setUndo(null)} />
      {loadError ? <LoadFailed message={loadError} onRetry={loadTasks} /> : <CaseTaskListV2
        tasks={tasks}
        currentStage={caseDetail?.stage}
        userId={user?.id}
        onToggle={(task) => void handleStatusChange(task.id, task.status === TaskStatus.DONE ? TaskStatus.TODO : TaskStatus.DONE)}
        onOpen={taskParam.open}
        onAdd={() => setShowForm(true)}
      />}

      {error && !showForm && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

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
          <div className="absolute inset-0 bg-[#101d2a]/45" onClick={() => { if (!creating) setShowForm(false); }} />
          <aside className="relative flex h-dvh w-full max-w-[520px] flex-col bg-[#fffdfa] shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b border-[#e2e0d8] px-6 py-4">
              <div>{caseDetail && <p className={v2.label}>{caseDetail.ownRef}</p>}<h2 className="text-xl font-bold">เพิ่มงานในคดีนี้</h2></div>
              <button type="button" aria-label="ปิดหน้าต่างเพิ่มงาน" onClick={() => { if (!creating) setShowForm(false); }} className={`${v2.btn} ${v2.ghost}`}><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>
            </div>
            <form id="create-case-task" onSubmit={handleCreate} onInvalidCapture={event => { const details = (event.target as HTMLElement).closest('details'); if (details) details.open = true; }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              <fieldset disabled={creating} className="flex min-w-0 flex-col gap-5">
                {error && <p role="alert" className={v2.error}>{error}</p>}
                <label className="block" htmlFor="case-task-title"><span className={v2.flabel}>ต้องทำอะไร *</span><input id="case-task-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus required placeholder="เช่น ขอคัดคำพิพากษา" className={`${v2.field} text-base sm:text-[15px]`} /></label>
                <div>
                  <label htmlFor="case-task-assignee" className={v2.flabel}>คนทำ</label>
                  <select
                    id="case-task-assignee"
                    value={newAssigneeId}
                    onChange={(e) => { setNewAssigneeId(e.target.value); if ((e.target.value || user?.id) === newReviewerId) setNewReviewerId(''); }}
                    className={`${v2.field} text-base sm:text-[15px]`}
                  >
                    <option value="">{user ? `${user.firstName} ${user.lastName ?? ''} (ฉัน)` : d.caseTasks.assignToMe}</option>
                    {caseTeam.length > 0 && (
                      <optgroup label={d.caseTasks.caseTeam}>
                        <AssigneeOptions users={caseTeam} flags={newTaskLeaveFlags} nameOf={assigneeName} />
                      </optgroup>
                    )}
                    {others.length > 0 && (
                      <optgroup label={d.caseTasks.otherMembers}>
                        <AssigneeOptions users={others} flags={newTaskLeaveFlags} nameOf={assigneeName} />
                      </optgroup>
                    )}
                  </select>
                  {newAssigneeUser && newTaskLeaveFlags.has(newAssigneeId) && (
                    <p className="flex items-start gap-1 mt-1 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      {leaveWarning(
                        `${newAssigneeUser.firstName} ${newAssigneeUser.lastName}`,
                        newTaskDate,
                        newTaskLeaveFlags.get(newAssigneeId)?.kind,
                      )}
                    </p>
                  )}
                  <p className={v2.hint}>คนที่เลือกจะได้รับแจ้งเตือนทันที</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="block" htmlFor="case-task-due"><span className={v2.flabel}>ครบกำหนด</span><ThaiDateField id="case-task-due" value={newDueDate} onChange={setNewDueDate} /></label>
                  <label className="block" htmlFor="case-task-stage"><span className={v2.flabel}>อยู่ในขั้น</span><select id="case-task-stage" value={newStage ?? caseDetail?.stage ?? ''} onChange={(e) => setNewStage(e.target.value)} className={`${v2.field} text-base sm:text-[15px]`}><option value="">ไม่ผูกกับขั้น</option>{caseStageOptions('th').map((option) => <option key={option.value} value={option.value}>{option.label}{option.value === caseDetail?.stage ? ' (ขั้นปัจจุบัน)' : ''}</option>)}</select></label>
                </div>
                <p className={`${v2.hint} rounded-lg bg-[#f3f1ea] p-3`}>งานในขั้นปัจจุบันต้องเสร็จก่อนจึงย้ายคดีไปขั้นถัดไปได้ — ถ้าเป็นงานที่ไม่บังคับ ให้เลือกขั้น “ไม่ผูกกับขั้น”</p>
                <details className="rounded-lg border border-[#e2e0d8] p-3">
                  <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold">ตั้งค่าเพิ่ม <span className={`${v2.label} ml-1 font-normal`}>· รายละเอียด · ผู้ตรวจ · ความสำคัญ · ผู้ติดตาม</span></summary>
                  <div className="mt-3">
                <div>
                  <label htmlFor="case-task-description" className="text-sm font-medium">{d.taskDetail.description}</label>
                  <textarea id="case-task-description" rows={3} maxLength={5000} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-card p-2 text-sm" placeholder={d.taskDetail.descriptionPlaceholder} />
                </div>
                  </div>
                  <label className="mt-3 flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" checked={newRequiresReview} onChange={event => { setNewRequiresReview(event.target.checked); if (!event.target.checked) setNewRequiresAttachment(false); setNewReviewerId(reviewers.find(member => member.id === caseDetail?.leadLawyer?.id)?.id ?? ''); }} />
                    ต้องให้ผู้ตรวจยืนยันก่อนปิดงาน
                  </label>
                  {newRequiresReview && (
                  <label className="mt-3 flex min-h-10 items-center gap-2 text-sm">
                      <input type="checkbox" checked={newRequiresAttachment} onChange={(e) => setNewRequiresAttachment(e.target.checked)} />
                      ต้องแนบไฟล์ผลงานก่อนส่งตรวจ
                    </label>)}
                  {newRequiresReview && <div className="mt-3">
                    <label htmlFor="case-task-reviewer" className="text-sm font-medium">ผู้ตรวจ<span aria-hidden="true" className="ml-1 text-destructive">*</span></label>
                    <select id="case-task-reviewer" required value={newReviewerId} onChange={event => setNewReviewerId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm">
                      <option value="">เลือกผู้ตรวจ</option>
                      {reviewers.map(member => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
                    </select>
                    {!reviewers.length && <p className="mt-1 text-xs text-muted-foreground">ต้องมี Owner ทนายอาวุโส หรือทนายหลักของคดีเป็นผู้ตรวจ (ไม่ใช่ผู้ทำงาน)</p>}
                  </div>}
                  <div className="mt-3">
                    <label htmlFor="case-task-priority" className="text-sm font-medium">{d.todos.priority}</label>
                    <select
                      id="case-task-priority"
                      value={newPriority}
                      onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                      className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
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
                  <button type="button" disabled={creating || !newTitle.trim()} onClick={() => void handleCreate(undefined, true)} className={`${v2.btn} ${v2.outline} mt-3`}>บันทึกแล้วเพิ่มงานอีกงาน</button>
                </details>
              </fieldset>
            </form>
            <div className="flex shrink-0 justify-end gap-2 border-t border-[#e2e0d8] px-6 py-4">
              <button type="button" onClick={() => { if (!creating) setShowForm(false); }} className={`${v2.btn} ${v2.ghost}`}>ยกเลิก</button>
              <button form="create-case-task" type="submit" disabled={creating || !newTitle.trim()} className={`${v2.btn} ${v2.primary} disabled:opacity-60`}>{creating ? 'กำลังบันทึก…' : 'บันทึกงาน'}</button>
            </div>
          </aside>
        </div>
      )}

      <details className={`${v2.card} mt-5`}>
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 py-3 font-semibold">เครื่องมือเพิ่มเติม <span className={v2.label}>· SOP · มุมมองบอร์ด · ตัวกรองละเอียด · สายงานส่งต่อ</span></summary>
        <div className="space-y-4 border-t border-[#e2e0d8] p-5">
          <div className="flex flex-wrap items-center gap-2"><TaskViewToggle layout={layout} onChange={setLayout} /></div>
      <div><CasePlaybook caseId={caseId} caseTypeId={caseDetail?.caseType?.id} initialReleaseId={searchParams.get('sop') ?? ''} onApplied={loadTasks} /></div>
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

      <>
      {filtering && visibleTasks.length === 0 && (
        <p role="status" className="mb-3 text-sm text-muted-foreground">{d.todos.noMatches}</p>
      )}
      {layout === 'board' || visibleTasks.length === 0 ? (() => { const groupTasks = visibleTasks; return (
      <KanbanBoard
        layout={layout}
        tasks={groupTasks}
        onStatusChange={handleStatusChange}
        currentUserId={user?.id ?? ''}
        caseLeadId={caseDetail?.leadLawyer?.id ?? null}
        currentUserRole={user?.firmRole}
        enableHandoff
        reviewerName={reviewerName}
        onHandoff={handleHandoff}
        onAccept={handleAccept}
        onReject={handleReject}
        onOpen={taskParam.open}
      />
      ); })() : stageGroups.map(([stage, groupTasks]) => {
        const finished = stage !== caseDetail?.stage && groupTasks.every((task) => task.status === TaskStatus.DONE);
        return <details key={stage || 'unassigned'} open={!finished} className="mb-3 rounded-lg border bg-card p-4">
          <summary className="min-h-11 cursor-pointer font-semibold">{stage ? caseStageLabel(stage, 'th') : 'งานที่ไม่ได้ระบุขั้น'} {finished && ` (เสร็จแล้ว ${groupTasks.length} งาน) · แสดงรายละเอียด`}</summary>
      <KanbanBoard
        layout={layout}
        tasks={groupTasks}
        onStatusChange={handleStatusChange}
        currentUserId={user?.id ?? ''}
        caseLeadId={caseDetail?.leadLawyer?.id ?? null}
        currentUserRole={user?.firmRole}
        enableHandoff
        reviewerName={reviewerName}
        onHandoff={handleHandoff}
        onAccept={handleAccept}
        onReject={handleReject}
        onOpen={taskParam.open}
      />
        </details>;
      })}

      </>
        </div>
      </details>
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
