'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, TaskItem, UserItem, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { Plus, Trash2 } from 'lucide-react';

/**
 * งาน/checklist ของเรื่องรับเข้า — intake คืองานก่อนฟ้องที่ทนายทำจริง
 * จึงต้องมี to-do ของตัวเองเหมือนคดี; เปิดคดีแล้วงานพวกนี้ตามไปเป็นงานคดีอัตโนมัติ
 */
export function IntakeTasksPanel({ intakeId, lawyers }: { intakeId: string; lawyers: UserItem[] }) {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!token) return;
    api.getIntakeTasks(token, intakeId).then(setTasks).catch(() => setTasks([]));
  }, [token, intakeId]);

  useEffect(reload, [reload]);

  const add = async () => {
    if (!token || !title.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.createIntakeTask(token, intakeId, {
        title: title.trim(),
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
      });
      setTitle('');
      setDueDate('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เพิ่มงานไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: TaskItem) => {
    if (!token) return;
    const status = task.status === 'DONE' ? 'TODO' : 'DONE';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: status as TaskItem['status'] } : t)));
    await api.updateIntakeTask(token, intakeId, task.id, { status }).catch(() => reload());
  };

  const remove = async (taskId: string) => {
    if (!token) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await api.deleteIntakeTask(token, intakeId, taskId).catch(() => reload());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">งานของเรื่องนี้ (To-do)</CardTitle>
        <p className="text-sm text-muted-foreground">เปิดคดีแล้วงานทั้งหมดจะย้ายไปอยู่ในคดีให้เอง</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีงาน</p>}
        <ul className="space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={t.status === 'DONE'}
                onChange={() => toggle(t)}
                className="h-4 w-4 rounded border-input"
                aria-label={`งาน: ${t.title}`}
              />
              <span className={t.status === 'DONE' ? 'line-through text-muted-foreground' : ''}>{t.title}</span>
              {t.assignee && (
                <span className="text-xs text-muted-foreground">· {t.assignee.firstName}</span>
              )}
              {t.dueDate && (
                <span className="text-xs text-muted-foreground">
                  · {new Date(t.dueDate).toLocaleDateString('th-TH')}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="ml-auto text-muted-foreground hover:text-destructive"
                aria-label="ลบงาน"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-border pt-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="เพิ่มงาน เช่น ขอเวชระเบียน, ร่างหนังสือทวงถาม"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              aria-label="ผู้รับผิดชอบ"
            >
              <option value="">ฉันเอง</option>
              {lawyers.map((u) => (
                <option key={u.id} value={u.id}>{u.firstName}</option>
              ))}
            </select>
            <ThaiDateInput value={dueDate} onChange={setDueDate} />
            <Button type="button" size="sm" onClick={add} disabled={busy || !title.trim()} className="ml-auto">
              <Plus className="mr-1 h-4 w-4" /> เพิ่ม
            </Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
