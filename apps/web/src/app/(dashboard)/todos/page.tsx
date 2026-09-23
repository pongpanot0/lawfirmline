'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { priorityLabel } from '@/lib/task-detail';
import { PageLoading } from '@/components/ui/misc';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

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
  const [createdTask, setCreatedTask] = useState<{ id: string; title: string } | null>(null);
  const [layout, setLayout] = useTaskLayout();
  const [scope, setScope] = useState<'mine' | 'team' | 'review'>('mine');
  const [taskType, setTaskType] = useState<'all' | 'case' | 'general'>('all');
  const [includeCompleted, setIncludeCompleted] = useState(false);
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
      loadTasks();
      setCreatedTask({ id: created.id, title: created.title });
      if (failedUploads || failedSubtasks) taskParam.open(created.id);
    } catch {
      // Keep what was typed: the retry should not start from a blank field.
      setError(d.todos.createFailed);
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <PageLoading title={d.todos.loading} lines={4} />;

  /** Switch scope labels on only when this list includes another assignee. */
  const seesOthers = tasks.some((t) => t.assignee && t.assignee.id !== user?.id);
  const ownershipTasks = !seesOthers
    ? tasks
    : scope === 'team'
      ? tasks
      : scope === 'review'
        ? tasks.filter((t) => t.status === TaskStatus.PENDING_REVIEW && t.assignee?.id === user?.id)
        : tasks.filter((t) => !t.assignee || t.assignee.id === user?.id);
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
    { key: 'team', label: d.todos.scopeTeam },
    { key: 'review', label: d.todos.scopeReview },
  ];
  const taskTypes: { key: typeof taskType; label: string; count: number }[] = [
    { key: 'all', label: d.todos.scopeAll, count: ownershipTasks.length },
    { key: 'case', label: d.todos.scopeCase, count: ownershipTasks.filter((task) => task.caseId).length },
    { key: 'general', label: d.todos.scopeGeneral, count: ownershipTasks.filter((task) => !task.caseId).length },
  ];
  const toggleCompleted = () => {
    if (includeCompleted && filters.status === TaskStatus.DONE) {
      setFilters((current) => ({ ...current, status: '' }));
    }
    setIncludeCompleted(!includeCompleted);
  };

  return (
    <div>
      <PageHeader
        title={seesOthers && scope === 'team' ? d.todos.titleTeam : d.todos.title}
        description={d.todos.description}
        actions={
          <div className="flex items-center gap-2">
            <TaskViewToggle layout={layout} onChange={setLayout} />
            <Button size="sm" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4" />
              {d.todos.addTodo}
            </Button>
          </div>
        }
      />

      {seesOthers && (
        <div role="group" aria-label={d.todos.taskScope} className="mb-4 flex flex-wrap gap-2">
          {scopes.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={scope === s.key}
              onClick={() => setScope(s.key)}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium transition-colors ${scope === s.key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {createdTask && <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="min-w-0 break-words text-sm">{text('สร้างงานแล้ว: ', 'Task created: ')}{createdTask.title}</p><Button variant="outline" size="sm" onClick={() => taskParam.open(createdTask.id)}>{text('เปิดรายละเอียด', 'View details')}</Button></div>}
      {error && !showForm && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}

      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{d.todos.taskType}</p>
              <div role="group" aria-label={d.todos.taskType} className="flex flex-wrap gap-1.5">
                {taskTypes.map((type) => (
                  <button
                    key={type.key}
                    type="button"
                    aria-pressed={taskType === type.key}
                    onClick={() => setTaskType(type.key)}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition-colors ${taskType === type.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                  >
                    {type.label}<span className="tabular-nums text-[11px] opacity-70">{type.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button type="button" size="sm" variant={includeCompleted ? 'outline' : 'ghost'} aria-pressed={includeCompleted} onClick={toggleCompleted}>
              {includeCompleted ? d.todos.hideCompleted : d.todos.showCompleted} <span className="ml-1 tabular-nums">{completedCount}</span>
            </Button>
          </div>
          <TaskFilterBar
            value={filters}
            onChange={setFilters}
            users={users}
            labels={collectTaskLabels(scopedTasks)}
            statuses={[TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.PENDING_REVIEW, TaskStatus.NEEDS_REVISION, ...(includeCompleted ? [TaskStatus.DONE] : [])]}
            shown={visibleTasks.length}
            total={tasksForView.length}
          />
        </CardContent>
      </Card>

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
              <label htmlFor="new-task-title" className="text-sm font-medium">{text('ต้องทำอะไร', 'What needs to be done?')}</label>
              <Input
                id="new-task-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={d.todos.titlePlaceholder}
                autoFocus
                required
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{d.taskDetail.assignee}</label>
                  <select
                    aria-label={d.taskDetail.assignee}
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                  >
                    <option value="">{d.todos.assignToMe}</option>
                    {assignableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{d.taskDetail.dueDate}</label>
                  <ThaiDateInput
                    value={newDueDate}
                    onChange={setNewDueDate}
                    className="mt-1"
                  />
                </div>
              </div>
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
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                      ))}
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
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">ไฟล์แนบ</label>
                <DocumentDropZone
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.xlsx,.txt"
                  hint="PDF, รูปภาพ, DOCX, XLSX, TXT · ไม่เกิน 30MB"
                  onFiles={(files) => setNewFiles((prev) => [...prev, ...files])}
                />
                {newFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {newFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          aria-label={`เอา ${f.name} ออก`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setNewFiles((prev) => prev.filter((_, x) => x !== i))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
        <KanbanBoard
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
