'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus, ArrowLeft } from 'lucide-react';
import { FirmRole, TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function CaseTasksPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadTasks = () => {
    if (!token || !id) return;
    api
      .getTasks(token, id)
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTasks();
  }, [token, id]);

  useEffect(() => {
    if (!token || !id) return;
    api.getCase(token, id).then(setCaseDetail).catch(console.error);
  }, [token, id]);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token || !id) return;
    await api.updateTask(token, id, taskId, { status });
    loadTasks();
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
    if (!token || !id || !newTitle) return;
    await api.createTask(token, id, { title: newTitle });
    setNewTitle('');
    setShowForm(false);
    loadTasks();
  };

  if (loading) return <p className="text-muted-foreground">{d.caseTasks.loading}</p>;

  const isReviewer =
    !!user && (user.firmRole === FirmRole.OWNER || user.id === caseDetail?.leadLawyer?.id);

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
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          {d.caseTasks.addTask}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleCreate} className="flex gap-3">
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={d.caseTasks.titlePlaceholder}
                className="flex-1"
                required
              />
              <Button type="submit" size="sm">{d.caseTasks.create}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <KanbanBoard
        tasks={tasks}
        onStatusChange={handleStatusChange}
        currentUserId={user?.id ?? ''}
        isReviewer={isReviewer}
        enableHandoff
        onHandoff={handleHandoff}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    </div>
  );
}
