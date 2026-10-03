'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { WorkflowRole, WorkflowStepDef } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS, ROLE_ORDER, blankStep } from './workflow-ui';

/** Ordered steps of a handoff chain: who does what, for how many business days. */
export function StepsEditor({ steps, onChange }: { steps: WorkflowStepDef[]; onChange: (steps: WorkflowStepDef[]) => void }) {
  const update = (i: number, patch: Partial<WorkflowStepDef>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...steps];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="rounded-lg border bg-card p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
            <input
              aria-label={`ชื่อขั้นที่ ${i + 1}`}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm"
              placeholder="เช่น แปลเอกสาร"
              value={step.title}
              onChange={(e) => update(i, { title: e.target.value })}
            />
            <Button type="button" variant="ghost" size="icon" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label="เลื่อนลง" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
            <Button type="button" variant="ghost" size="icon" aria-label={`ลบขั้นที่ ${i + 1}`} disabled={steps.length === 1} onClick={() => onChange(steps.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
            <label className="text-xs text-muted-foreground">
              ใครทำ
              <select
                className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                value={step.role}
                onChange={(e) => update(i, { role: e.target.value as WorkflowRole })}
              >
                {ROLE_ORDER.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              ภายใน (วันทำการ)
              <input
                type="number" min={1} max={60}
                className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                value={step.durationDays}
                onChange={(e) => update(i, { durationDays: Number(e.target.value) })}
              />
            </label>
          </div>
          <textarea
            aria-label={`วิธีทำขั้นที่ ${i + 1}`}
            className="mt-2 min-h-[56px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            placeholder="วิธีทำ / สิ่งที่ต้องส่งต่อ (ไม่บังคับ)"
            value={step.instructions ?? ''}
            onChange={(e) => update(i, { instructions: e.target.value })}
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(step.requiresReview)} onChange={(e) => update(i, { requiresReview: e.target.checked })} />
            ต้องมีผู้ตรวจก่อนส่งต่อ
          </label>
        </li>
      ))}
      <li>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...steps, blankStep()])}>
          <Plus className="mr-1 h-4 w-4" />เพิ่มขั้น
        </Button>
      </li>
    </ol>
  );
}
