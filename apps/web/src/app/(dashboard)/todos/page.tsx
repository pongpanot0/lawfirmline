'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { canAssignFirmRole, FirmRole, TaskPriority, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { useTaskParam } from '@/components/tasks/useTaskParam';
import { TaskFilterBar } from '@/components/tasks/TaskFilterBar';
import { applyTaskFilters, collectTaskLabels, EMPTY_TASK_FILTERS, hasActiveTaskFilters, TaskFilters } from '@/lib/task-filters';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { priorityLabel } from '@/lib/task-detail';
import { PageLoading } from '@/components/ui/misc';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { AssigneeOptions } from '@/components/ui/AssigneeOptions';
import { useLeaveFlags } from '@/lib/use-leave-flags';
import { leaveWarning } from '@/lib/leave-flags';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { DateField, SelectField, TextField } from '@/components/ui/form-fields';
import { formatDate } from '@/lib/utils';

function TodosPageContent() {
  const d = useDashboardT();
  const { locale } = useLocale();
  const text = (th: string, en: string) => locale === 'th' ? th : en;
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  // Consume the entry action so the global shortcut can open the form again
  // even when the user is already on the task page.
  useEffect(() => {
    if (!searchParams.has('new')) return;
    setShowForm(true);
    const assignee = searchParams.get('assignee');
    if (assignee) setNewAssigneeId(assignee);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('new');
    next.delete('assignee');
    next.delete('task');
    router.replace(`/todos${next.size ? `?${next}` : ''}`, { scroll: false });
  }, [searchParams, router]);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<TaskPriority>(TaskPriority.MEDIUM);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newStatus, setNewStatus] = useState<TaskStatus>(TaskStatus.TODO);
  const [newDescription, setNewDescription] = useState('');
  const [newLabels, setNewLabels] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<{ title: string; assigneeId: string; dueDate: string }[]>([]);
  const [subDraft, setSubDraft] = useState({ title: '', assigneeId: '', dueDate: '' });
  const fmtUploadFailed = (n: number) => `สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ ${n} ไฟล์ — แนบใหม่ได้ในหน้ารายละเอียดงาน`;
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [usersLoadError, setUsersLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdTask, setCreatedTask] = useState<{ id: string; title: string; assignee: string } | null>(null);
  const [layout, setLayout] = useTaskLayout();
  const [scope, setScope] = useState<'mine' | 'team' | 'created' | 'review'>('mine');
  useEffect(() => {
    setScope(user?.firmRole === FirmRole.OWNER ? 'team' : 'mine');
  }, [user?.firmRole]);
  const [taskType, setTaskType] = useState<'all' | 'case' | 'general'>('all');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const taskParam = useTaskParam();
  // Creating a task for someone else follows the firm hierarchy: only roles
  // below yours (assigning to yourself is the empty default option).
  const assignableUsers = user
    ? users.filter((u) => u.id !== user.id && u.firmRole != null && canAssignFirmRole(user.firmRole, u.firmRole))
    : [];
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const today = bangkokDateInputValue(new Date());
  const newTaskDate = newDueDate || today;
  const newTaskLeaveFlags = useLeaveFlags(token, newTaskDate);
  const subtaskDraftDate = subDraft.dueDate || today;
  const subtaskDraftLeaveFlags = useLeaveFlags(token, subtaskDraftDate);
  const newAssigneeUser = assignableUsers.find((u) => u.id === newAssigneeId);

  const loadTasks = () => {
    if (!token) return;
    setLoadError('');
    Promise.all([api.getMyTodos(token), api.getTaskInbox(token)])
      .then(([assignedTasks, accessibleOpenTasks]) => {
        const tasksById = new Map<string, TaskItem>();
        for (const task of assignedTasks) tasksById.set(task.id, task);
        for (const task of accessibleOpenTasks) {
          const assignedTask = tasksById.get(task.id);
          tasksById.set(task.id, assignedTask
            ? { ...task, ...assignedTask, case: task.case ?? assignedTask.case }
            : task);
        }
        setTasks([...tasksById.values()]);
      })
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

  // My work list mixes standalone todos and case tasks — each routes to its
  // own endpoint set, since a case task's review flow (reviewer implied by
  // the case) differs from a standalone todo's (reviewer picked by hand).
  const caseIdOf = (taskId: string) => tasks.find((t) => t.id === taskId)?.caseId ?? null;

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token) return;
    setError('');
    try {
      const caseId = caseIdOf(taskId);
      if (caseId) await api.updateTask(token, caseId, taskId, { status });
      else await api.updateTodo(token, taskId, { status });
      loadTasks();
    } catch {
      setError(d.todos.actionFailed);
    }
  };

  // Handoff/review failures are reported by the board on the task itself,
  // where the form that failed still is; so these rethrow rather than catch.
  const handleHandoff = async (taskId: string, note: string, reviewerId?: string) => {
    if (!token) return;
    const caseId = caseIdOf(taskId);
    if (caseId) await api.handoffTask(token, caseId, taskId, { note: note || undefined });
    else {
      if (!reviewerId) return;
      await api.handoffTodo(token, taskId, { reviewerId, note: note || undefined });
    }
    loadTasks();
  };

  const handleAccept = async (taskId: string) => {
    if (!token) return;
    const caseId = caseIdOf(taskId);
    if (caseId) await api.acceptTask(token, caseId, taskId);
    else await api.acceptTodo(token, taskId);
    loadTasks();
  };

  const handleReject = async (taskId: string, reason: string) => {
    if (!token) return;
    const caseId = caseIdOf(taskId);
    if (caseId) await api.rejectTask(token, caseId, taskId, { reason });
    else await api.rejectTodo(token, taskId, { reason });
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
        status: newStatus,
        description: newDescription.trim() || undefined,
        labels: newLabels.length ? newLabels : undefined,
      });
      const assigneeName = newAssigneeUser
        ? `${newAssigneeUser.firstName} ${newAssigneeUser.lastName}`
        : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
      let failedSubtasks = 0;
      for (const sub of newSubtasks) {
        try {
          await api.createSubtask(token, created.id, {
            title: sub.title,
            assigneeId: sub.assigneeId || undefined,
            dueDate: sub.dueDate || undefined,
          });
        } catch {
          failedSubtasks += 1;
        }
      }
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
      if (failedUploads || failedSubtasks) setError([failedUploads ? fmtUploadFailed(failedUploads) : '', failedSubtasks ? `สร้างงานหลักแล้ว แต่งานย่อยไม่สำเร็จ ${failedSubtasks} รายการ — เพิ่มใหม่ในรายละเอียดงาน` : ''].filter(Boolean).join(' · '));
      setNewTitle('');
      setNewAssigneeId('');
      setNewDueDate('');
      setNewPriority(TaskPriority.MEDIUM);
      setNewStatus(TaskStatus.TODO);
      setNewDescription('');
      setNewLabels([]);
      setLabelDraft('');
      setNewSubtasks([]);
      setSubDraft({ title: '', assigneeId: '', dueDate: '' });
      setNewFiles([]);
      setShowForm(false);
      setScope('created');
      setFilters(EMPTY_TASK_FILTERS);
      setTaskType('all');
      setIncludeCompleted(created.status === TaskStatus.DONE);
      loadTasks();
      setCreatedTask({ id: created.id, title: created.title, assignee: assigneeName });
      taskParam.open(created.id);
    } catch (err) {
      // Keep what was typed: the retry should not start from a blank field.
      setError(err instanceof ApiError && err.message ? err.message : d.todos.createFailed);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageLoading title={d.todos.loading} lines={4} />;

  /** Switch scope labels on only when this list includes another assignee. */
  const seesOthers = tasks.some((t) => t.assignee && t.assignee.id !== user?.id);
  const isMyWork = (task: TaskItem) => task.assignee?.id === user?.id ||
    ((task.status === TaskStatus.PENDING_REVIEW || task.status === TaskStatus.DONE) && task.handedOffById === user?.id);
  const ownershipTasks = scope === 'team'
      ? tasks
      : scope === 'created'
        ? tasks.filter(t => t.createdById === user?.id)
      : scope === 'review'
        ? tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW && t.assignee?.id === user?.id)
        : tasks.filter(isMyWork);
  const scopedTasks = ownershipTasks.filter((task) =>
    taskType === 'all' || (taskType === 'case' ? Boolean(task.caseId) : !task.caseId),
  );
  const completedCount = scopedTasks.filter((task) => task.status === TaskStatus.DONE).length;
  const tasksForView = includeCompleted
    ? scopedTasks
    : scopedTasks.filter((task) => task.status !== TaskStatus.DONE);
  const visibleTasks = applyTaskFilters(tasksForView, filters);
  const filtering = hasActiveTaskFilters(filters);
  const scopes: { key: typeof scope; label: string }[] = [
    { key: 'mine', label: d.todos.scopeMine },
    { key: 'created', label: text('งานที่ฉันสร้าง', 'Created by me') },
    { key: 'team', label: d.todos.scopeTeam },
    { key: 'review', label: d.todos.scopeReview },
  ];
  const quickViews = [
    { key: 'all', label: text('งานที่ยังไม่เสร็จ', 'Open tasks'), count: scopedTasks.filter(task => task.status !== TaskStatus.DONE).length },
    { key: 'overdue', label: text('เลยกำหนด', 'Overdue'), count: scopedTasks.filter(task => task.status !== TaskStatus.DONE && task.dueDate && bangkokDateInputValue(task.dueDate) < today).length },
    { key: 'today', label: text('ส่งวันนี้', 'Due today'), count: scopedTasks.filter(task => task.status !== TaskStatus.DONE && task.dueDate && bangkokDateInputValue(task.dueDate) === today).length },
    { key: 'review', label: text('รอตรวจ', 'Awaiting review'), count: scopedTasks.filter(task => task.status === TaskStatus.PENDING_REVIEW).length },
  ];
  const quickView = filters.status === TaskStatus.PENDING_REVIEW ? 'review' : filters.due === 'overdue' || filters.due === 'today' ? filters.due : !filters.status && !filters.due && !includeCompleted ? 'all' : '';
  const statusLabels: Record<TaskStatus, string> = {
    TODO: text('รอเริ่ม', 'To do'), IN_PROGRESS: text('กำลังทำ', 'In progress'),
    PENDING_REVIEW: text('รอตรวจ', 'Awaiting review'), NEEDS_REVISION: text('ต้องแก้ไข', 'Needs revision'), DONE: text('เสร็จแล้ว', 'Done'),
  };
  const toggleCompleted = () => {
    if (includeCompleted && filters.status === TaskStatus.DONE) {
      setFilters((current) => ({ ...current, status: '' }));
    }
    setIncludeCompleted(!includeCompleted);
  };

  return (
    <div className={taskParam.taskId ? 'xl:pr-[480px]' : ''}>
      <PageHeader
        title={scope === 'created' ? text('งานที่ฉันสร้าง', 'Created by me') : scope === 'team' ? d.todos.titleTeam : d.todos.title}
        description={text('เลือกงานเพื่อดูรายละเอียด อัปเดตความคืบหน้า หรือส่งตรวจ', 'Open a task to see details, update progress or submit for review')}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4" />
              {d.todos.addTodo}
            </Button>
          </div>
        }
      />

      {(
        <div role="group" aria-label={d.todos.taskScope} className="mb-4 flex flex-wrap gap-2">
          {scopes.filter(s => s.key !== 'team' || seesOthers || user?.firmRole === FirmRole.OWNER).map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={scope === s.key}
              onClick={() => { setScope(s.key); setFilters(EMPTY_TASK_FILTERS); setTaskType('all'); setIncludeCompleted(false); }}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium transition-colors ${scope === s.key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {s.label} <span className="ml-1 opacity-70">{tasks.filter(task => s.key === 'team' || (s.key === 'created' ? task.createdById === user?.id : s.key === 'review' ? task.assignee?.id === user?.id && task.status === TaskStatus.PENDING_REVIEW : isMyWork(task))).length}</span>
            </button>
          ))}
        </div>
      )}

      {createdTask && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="min-w-0 break-words text-sm"><p className="font-medium">{text('สร้างงานแล้ว: ', 'Task created: ')}{createdTask.title}</p><p className="mt-1 text-muted-foreground">{text('มอบหมายให้ ', 'Assigned to ')}{createdTask.assignee} · {text('ติดตามได้ใน “งานที่ฉันสร้าง”', 'Track under Created by me')}</p></div><Button variant="outline" size="sm" onClick={() => taskParam.open(createdTask.id)}>{text('เปิดงาน / แนบไฟล์', 'Open task / Attach files')}</Button></div>}
      {error && !showForm && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="mb-4">
        <CardContent className="space-y-4 p-4">
          <div role="group" aria-label={text('เลือกงานที่ต้องติดตาม', 'Focus tasks')} className="flex flex-wrap gap-2">
            {quickViews.map(view => <button key={view.key} type="button" aria-pressed={quickView === view.key}
              onClick={() => { setIncludeCompleted(false); setFilters(current => ({ ...current, status: view.key === 'review' ? TaskStatus.PENDING_REVIEW : '', due: view.key === 'overdue' || view.key === 'today' ? view.key : '' })); }}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${quickView === view.key ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground hover:bg-muted'}`}>
              {view.label} <span className="ml-1 tabular-nums opacity-70">{view.count}</span>
            </button>)}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <TextField label={text('ค้นหางาน', 'Search tasks')} placeholder={text('ชื่องาน คดี หรือชื่อคนทำงาน', 'Task, case or assignee')} value={filters.search}
              onChange={event => setFilters(current => ({ ...current, search: event.target.value }))} containerClassName="min-w-0 flex-1 basis-56" />
            {scope === 'team' && <SelectField label={text('คนทำงาน', 'Assignee')} value={filters.assigneeId} onChange={event => setFilters(current => ({ ...current, assigneeId: event.target.value }))} containerClassName="w-full sm:w-48">
              <option value="">{text('ทุกคน', 'Everyone')}</option><option value="unassigned">{d.taskDetail.unassigned}</option>
              {users.map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}
            </SelectField>}
          </div>
          <details className="border-t border-border pt-3">
            <summary className="cursor-pointer text-sm text-muted-foreground">{text('ตัวกรองเพิ่มเติม', 'More filters')}{(filters.priority || filters.label || taskType !== 'all' || includeCompleted || (filters.status && quickView !== 'review') || (filters.due && quickView !== 'overdue' && quickView !== 'today')) && text(' · มีตัวกรองใช้งานอยู่', ' · Filters applied')}</summary>
            <div className="mt-4 space-y-3">
              <SelectField label={d.todos.taskType} value={taskType} onChange={event => setTaskType(event.target.value as typeof taskType)} containerClassName="sm:max-w-48">
                <option value="all">{d.todos.scopeAll}</option><option value="case">{d.todos.scopeCase}</option><option value="general">{d.todos.scopeGeneral}</option>
              </SelectField>
              <Button type="button" size="sm" variant="outline" aria-pressed={includeCompleted} onClick={toggleCompleted}>{includeCompleted ? d.todos.hideCompleted : d.todos.showCompleted} ({completedCount})</Button>
          <TaskFilterBar
            value={filters}
            onChange={setFilters}
            users={users}
            labels={collectTaskLabels(scopedTasks)}
            statuses={[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW, TaskStatus.NEEDS_REVISION, ...(includeCompleted ? [TaskStatus.DONE] : [])]}
            shown={visibleTasks.length}
            total={tasksForView.length}
          />
            </div>
          </details>
          {(filtering || taskType !== 'all' || includeCompleted) && <Button type="button" size="sm" variant="ghost" onClick={() => { setFilters(EMPTY_TASK_FILTERS); setTaskType('all'); setIncludeCompleted(false); }}>{text('ล้างตัวกรองทั้งหมด', 'Clear all filters')}</Button>}
        </CardContent>
      </Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">{text(`แสดง ${visibleTasks.length} งาน · เรียงตามกำหนดส่ง`, `${visibleTasks.length} tasks · Ordered by due date`)}</p>
        <TaskViewToggle layout={layout} onChange={setLayout} />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={d.todos.addTodo} onKeyDown={event => {
          if (event.key === 'Escape' && !creating) { event.stopPropagation(); setShowForm(false); }
          if (event.key === 'Tab') {
            const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
          <div className="absolute inset-0 bg-black/30" onClick={() => { if (!creating) setShowForm(false); }} />
          <aside className="relative flex h-dvh w-full max-w-lg flex-col border-l border-border bg-card shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">{d.todos.addTodo}</h2>
              <button type="button" aria-label={d.common.close} onClick={() => { if (!creating) setShowForm(false); }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form id="create-personal-task" onSubmit={handleCreate} className="min-h-0 flex-1 overflow-y-auto p-5">
              <fieldset disabled={creating} className="flex min-w-0 flex-col gap-4">
              <p className="text-sm text-muted-foreground">{text('พิมพ์ชื่องานก็สร้างได้ทันที มอบหมายให้ตัวเองเป็นค่าเริ่มต้น', 'Only a task name is required. Assigned to you by default.')}</p>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <TextField
                label={text('ต้องทำอะไร', 'What needs to be done?')}
                id="new-task-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={d.todos.titlePlaceholder}
                autoFocus
                required
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <SelectField
                    label={text('ใครเป็นคนทำ', 'Who will do this?')}
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                  >
                    <option value="">{d.todos.assignToMe}</option>
                    <AssigneeOptions users={assignableUsers} flags={newTaskLeaveFlags} />
                  </SelectField>
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
                  <DateField
                    label={d.taskDetail.dueDate}
                    value={newDueDate}
                    onChange={event => setNewDueDate(event.target.value)}
                  />
                </div>
              </div>
              <section className="space-y-2" aria-label={text('ไฟล์แนบสำหรับงานใหม่', 'New task attachments')}>
                <p className="text-sm font-medium">{text('ไฟล์แนบ (ไม่บังคับ)', 'Attachments (optional)')}</p>
                <DocumentDropZone multiple disabled={creating} label={text('เลือกไฟล์แนบ', 'Choose attachments')} accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.txt"
                  hint="PDF, รูปภาพ, DOCX, XLSX, TXT · ไม่เกิน 30MB" onFiles={files => setNewFiles(previous => [...previous, ...files])} />
                {newFiles.length > 0 && <ul className="space-y-1">{newFiles.map((file, index) => <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="min-w-0 break-words">{file.name}</span><button type="button" aria-label={`เอา ${file.name} ออก`} className="shrink-0 p-2 text-muted-foreground" onClick={() => setNewFiles(previous => previous.filter((_, i) => i !== index))}>×</button>
                </li>)}</ul>}
                {newFiles.length > 0 && <p className="text-xs text-muted-foreground">{text(`จะบันทึก ${newFiles.length} ไฟล์พร้อมงานเมื่อกดสร้างงาน`, `${newFiles.length} files will be uploaded when you create this task`)}</p>}
              </section>
              <details className="rounded-xl border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">{text('รายละเอียดเพิ่มเติม (ไม่บังคับ)', 'More details (optional)')}</summary>
                <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{d.taskDetail.status}</label>
                  <select
                    aria-label={d.taskDetail.status}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as TaskStatus)}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    {[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.DONE].map((st) => (
                      <option key={st} value={st}>
                        {st === TaskStatus.TODO ? d.todos.columnTodo : st === TaskStatus.IN_PROGRESS ? d.todos.columnInProgress : d.todos.columnDone}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{d.todos.priority}</label>
                  <div className="mt-1 flex gap-1.5">
                    {[TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW].map((p) => (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={newPriority === p}
                        onClick={() => setNewPriority(p)}
                        className={`rounded-full border px-3 py-1.5 text-xs ${newPriority === p ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        {priorityLabel(d, p)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Label</label>
                {newLabels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {newLabels.map((l) => (
                      <span key={l} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        {l}
                        <button type="button" aria-label={`เอา ${l} ออก`} className="text-muted-foreground hover:text-destructive" onClick={() => setNewLabels((prev) => prev.filter((x) => x !== l))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const l = labelDraft.trim();
                      if (l && !newLabels.includes(l)) setNewLabels((prev) => [...prev, l]);
                      setLabelDraft('');
                    }
                  }}
                  placeholder={d.taskDetail.labelPlaceholder}
                  className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{d.taskDetail.description}</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={d.taskDetail.descriptionPlaceholder}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{d.taskDetail.subtasks}</label>
                {newSubtasks.length > 0 && (
                  <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
                    {newSubtasks.map((sub, i) => {
                      const who = assignableUsers.find((u) => u.id === sub.assigneeId);
                      return (
                        <li key={`${sub.title}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <span className="flex-1 truncate">{sub.title}</span>
                          {who && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{who.firstName}</span>}
                          {sub.dueDate && <span className="text-xs text-muted-foreground">{sub.dueDate}</span>}
                          <button type="button" aria-label={`เอา ${sub.title} ออก`} className="text-muted-foreground hover:text-destructive" onClick={() => setNewSubtasks((prev) => prev.filter((_, x) => x !== i))}>×</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-1 space-y-2 rounded-lg border border-dashed border-border p-2">
                  <input
                    value={subDraft.title}
                    onChange={(e) => setSubDraft({ ...subDraft, title: e.target.value })}
                    placeholder={d.taskDetail.subtaskPlaceholder}
                    className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={d.taskDetail.assignee}
                      value={subDraft.assigneeId}
                      onChange={(e) => setSubDraft({ ...subDraft, assigneeId: e.target.value })}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
                    >
                      <option value="">{d.todos.assignToMe}</option>
                      <AssigneeOptions users={assignableUsers} flags={subtaskDraftLeaveFlags} />
                    </select>
                    <ThaiDateInput
                      value={subDraft.dueDate}
                      onChange={(v) => setSubDraft({ ...subDraft, dueDate: v })}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!subDraft.title.trim()}
                      onClick={() => {
                        setNewSubtasks((prev) => [...prev, { ...subDraft, title: subDraft.title.trim() }]);
                        setSubDraft({ title: '', assigneeId: '', dueDate: '' });
                      }}
                    >
                      {d.taskDetail.addSubtask}
                    </Button>
                  </div>
                  {subDraft.assigneeId && subtaskDraftLeaveFlags.has(subDraft.assigneeId) && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {leaveWarning(
                        (() => {
                          const u = assignableUsers.find((x) => x.id === subDraft.assigneeId);
                          return u ? `${u.firstName} ${u.lastName}` : '';
                        })(),
                        subtaskDraftDate,
                        subtaskDraftLeaveFlags.get(subDraft.assigneeId)?.kind,
                      )}
                    </p>
                  )}
                </div>
              </div>
                </div>
              </details>
              </fieldset>
            </form>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button type="button" variant="outline" disabled={creating} onClick={() => setShowForm(false)}>{text('กลับก่อน', 'Back')}</Button>
              <Button form="create-personal-task" type="submit" disabled={creating || !newTitle.trim()}>{creating ? text('กำลังสร้างงาน…', 'Creating…') : d.todos.create}</Button>
            </div>
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
      {visibleTasks.length === 0 ? (
        <div role="status" className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">{filtering ? d.todos.noMatches : completedCount > 0 && !includeCompleted ? d.todos.noOpenTasks : d.todos.noTasks}</p>
          {!filtering && completedCount > 0 && !includeCompleted && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setIncludeCompleted(true)}>
              {d.todos.showCompleted} ({completedCount})
            </Button>
          )}
        </div>
      ) : (
        layout === 'list' ? <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {[...visibleTasks].sort((a, b) => Number(a.status === TaskStatus.DONE) - Number(b.status === TaskStatus.DONE) || (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)).map(task => {
            const overdue = task.status !== TaskStatus.DONE && task.dueDate && bangkokDateInputValue(task.dueDate) < today;
            return <li key={task.id}><button type="button" onClick={() => taskParam.open(task.id)} className="flex w-full flex-wrap items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="break-words text-sm font-semibold">{task.title}</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{task.case ? `${task.case.ownRef} · ${task.case.title}` : text('งานทั่วไป', 'General task')} · {task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : d.taskDetail.unassigned}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {task.priority === TaskPriority.HIGH && <span className="font-medium text-destructive">{text('สำคัญมาก', 'High priority')}</span>}
                <span className={`rounded-full px-2.5 py-1 ${task.status === TaskStatus.PENDING_REVIEW ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : task.status === TaskStatus.DONE ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{statusLabels[task.status]}</span>
                <span className={overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>{overdue ? text('เลยกำหนด · ', 'Overdue · ') : ''}{task.dueDate ? formatDate(task.dueDate) : text('ยังไม่กำหนดส่ง', 'No due date')}</span>
                <span className="ml-1 font-medium text-primary">{text('เปิดงาน →', 'Open task →')}</span>
              </div>
            </button></li>;
          })}
        </ul> : <KanbanBoard
          layout={layout}
          tasks={visibleTasks}
          onStatusChange={handleStatusChange}
          currentUserId={user?.id ?? ''}
          showCaseContext
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
      )}
      </>
      )}
      <TaskDetailDrawer
        taskId={taskParam.taskId}
        users={users}
        onClose={taskParam.close}
        onChanged={loadTasks}
        onNavigate={taskParam.open}
        aiPanel
        splitDesktop
      />
    </div>
  );
}

export default function TodosPage() {
  const d = useDashboardT();
  const { locale } = useLocale();
  const text = (th: string, en: string) => locale === 'th' ? th : en;
  return (
    <Suspense fallback={<PageLoading title={d.todos.loading} lines={4} />}>
      <TodosPageContent />
    </Suspense>
  );
}
