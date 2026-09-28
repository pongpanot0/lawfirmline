'use client';

import { useState } from 'react';
import { TASK_SIZES, TaskSize } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const SIZE_LABELS: Record<string, string> = Object.fromEntries(TASK_SIZES.map((s) => [s.value, s.label.split(' ')[0]]));

/** Size badge that turns into an S/M/L toggle on tap and saves immediately (owner only). */
export function TaskSizePicker({ taskId, title, size, onSaved }: {
  taskId: string; title: string; size: TaskSize; onSaved: (size: TaskSize) => void;
}) {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (next: TaskSize) => {
    if (!token || saving) return;
    if (next === size) { setOpen(false); return; }
    setSaving(true); setError('');
    try {
      await api.setTaskSize(token, taskId, next);
      setOpen(false);
      onSaved(next);
    } catch (err) { setError(err instanceof Error ? err.message : 'บันทึกขนาดไม่ได้'); }
    finally { setSaving(false); }
  };

  return <span className="flex shrink-0 flex-col items-end">
    {open
      ? <span role="group" aria-label={`ขนาดของ ${title}`} className="flex overflow-hidden rounded-full border">
        {TASK_SIZES.map((s) => <button key={s.value} type="button" disabled={saving} aria-pressed={size === s.value} onClick={() => void save(s.value)}
          className={`px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50 ${size === s.value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{SIZE_LABELS[s.value]}</button>)}
      </span>
      : <button type="button" onClick={() => { setOpen(true); setError(''); }} aria-label={`แก้ขนาดงาน ${title}`}
        className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {SIZE_LABELS[size]}
      </button>}
    {error && <span role="alert" className="mt-1 text-xs text-destructive">{error}</span>}
  </span>;
}
