'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TaskStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, TaskItem } from '@/lib/api';
import { KanbanBoard } from '@/components/KanbanBoard';

export default function CaseTasksPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
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

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!token || !id) return;
    await api.updateTask(token, id, taskId, { status });
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

  if (loading) return <p className="text-slate-500">Loading tasks...</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">
            ← Back to case
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Task Board</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Add Task
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white hover:bg-brand-700"
          >
            Create
          </button>
        </form>
      )}

      <KanbanBoard tasks={tasks} onStatusChange={handleStatusChange} />
    </div>
  );
}
