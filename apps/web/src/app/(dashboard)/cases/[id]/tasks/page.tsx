'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, ArrowLeft } from 'lucide-react';
import { FirmRole, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem, UserItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { TaskViewToggle, useTaskLayout } from '@/components/tasks/TaskViewToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function CaseTasksPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [layout, setLayout] = useTaskLayout();

  const loadTasks = () => {
    if (!token || !id) return;
    setLoadError('');
    api
      .getTasks(token, id)
      .then(setTasks)
      // A failed load must not read as "nothing to do".
      .catch(() => setLoadError(d.todos.loadFailed))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    api.getCase(token, id).then(setCaseDetail).catch(console.error);
  }, [token, id]);

  useEffect(() => {
    if (!token) return;
    // The firm's lawyers, not the admin-only user directory.
    api.getLawyers(token).then(setUsers).catch(console.error);
  }, [token]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token || !id) return;
    setError('');
    try {
      await api.updateTask(token, id, taskId, { status });
      loadTasks();
    } catch {
      setError(d.caseTasks.updateFailed);
    }
  };

  const handleHandoff = async (taskId: string, note: string) => {
    if (!token || !id) return;
    await api.handoffTask(token, id, taskId, { note: note || undefined });
    loadTasks();
  };

  const handleAccept = async (taskId: string) => {
    if (!token || !id) return;
    await api.acceptTask(token, id, taskId);
    loadTasks();
  };

  const handleReject = async (taskId: string, reason: string) => {
    if (!token || !id) return;
    await api.rejectTask(token, id, taskId, { reason });
    loadTasks();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id || !newTitle.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await api.createTask(token, id, {
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
        <div>
          <Link href={`/cases/${id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {d.messages.backToCase.replace('← ', '')}
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{d.caseTasks.title}</h1>
        </div>
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
      />
      )}
    </div>
  );
}
