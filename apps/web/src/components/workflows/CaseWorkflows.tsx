'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Circle, Download, GitFork, Loader2, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type CaseWorkflowRun, type WorkflowRunFiles } from '@/lib/api';
import { downloadTaskAttachment } from '@/lib/task-detail';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/misc';
import { StartWorkflowDrawer } from './StartWorkflowDrawer';
import { fileSize, shortThaiDate } from './workflow-ui';

const RUN_STATUS: Record<CaseWorkflowRun['status'], { label: string; variant: 'default' | 'success' | 'muted' }> = {
  ACTIVE: { label: 'กำลังเดิน', variant: 'default' },
  DONE: { label: 'เสร็จแล้ว', variant: 'success' },
  CANCELLED: { label: 'ยกเลิกแล้ว', variant: 'muted' },
};

/** Handoff chains on one case: where each run is, its files, and the actions on it. */
export function CaseWorkflows({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [runs, setRuns] = useState<CaseWorkflowRun[]>([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    api.getCaseWorkflows(token, caseId).then(setRuns).catch((e) => setError(e.message));
  }, [token, caseId]);
  useEffect(load, [load]);

  if (!token) return null;
  const active = runs.filter((r) => r.status === 'ACTIVE');
  const past = runs.filter((r) => r.status !== 'ACTIVE');

  return (
    <section className="mb-4 rounded-xl border bg-card p-4" aria-labelledby="case-workflows-title">
      <div className="mb-3 flex items-center gap-2">
        <GitFork className="h-4 w-4 text-primary" />
        <h2 id="case-workflows-title" className="font-semibold">สายงานส่งต่อ</h2>
        <Button size="sm" className="ml-auto" onClick={() => setStarting(true)}><Plus className="mr-1 h-4 w-4" />เริ่มสายงาน</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!runs.length && !error && (
        <p className="text-sm text-muted-foreground">ยังไม่มีสายงาน — ใช้เมื่องานต้องส่งต่อเป็นทอด เช่น แปล → ทำใบเบิกความ → เขียนคำฟ้อง</p>
      )}
      <div className="space-y-3">
        {active.map((run) => <RunCard key={run.id} run={run} token={token} onChanged={load} />)}
        {past.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">สายงานที่จบแล้ว ({past.length})</summary>
            <div className="mt-2 space-y-3">{past.map((run) => <RunCard key={run.id} run={run} token={token} onChanged={load} />)}</div>
          </details>
        )}
      </div>
      <StartWorkflowDrawer open={starting} token={token} caseId={caseId} onClose={() => setStarting(false)} onStarted={load} />
    </section>
  );
}

function RunCard({ run, token, onChanged }: { run: CaseWorkflowRun; token: string; onChanged: () => void }) {
  const [files, setFiles] = useState<WorkflowRunFiles[] | null>(null);
  const [sendBack, setSendBack] = useState(false);
  const [toStep, setToStep] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentIndex = run.steps.findIndex((s) => s.status !== 'DONE');
  const status = RUN_STATUS[run.status];

  const showFiles = () => {
    if (files) return setFiles(null);
    api.getWorkflowRunFiles(token, run.id).then(setFiles).catch((e) => setError(e.message));
  };

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); onChanged(); setSendBack(false); setReason(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ'); }
    finally { setBusy(false); }
  };

  return (
    <article className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{run.name}</h3>
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="text-xs text-muted-foreground">{run.steps.filter((s) => s.status === 'DONE').length}/{run.steps.length} ขั้น</span>
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="ขั้นของสายงาน">
        {run.steps.map((step, i) => {
          const done = step.status === 'DONE';
          const current = i === currentIndex && run.status === 'ACTIVE';
          const overdue = current && step.dueDate && new Date(step.dueDate) < new Date();
          return (
            <li key={step.taskId} aria-current={current ? 'step' : undefined}
              className={`min-w-[10rem] flex-1 rounded-md border px-3 py-2 text-sm ${current ? 'border-primary bg-primary/5' : done ? 'bg-muted/40' : ''}`}>
              <div className="flex items-center gap-1 font-medium">
                {done ? <Check className="h-4 w-4 text-emerald-600" /> : current ? <Loader2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                {i + 1}. {step.title}
              </div>
              <div className="text-xs text-muted-foreground">{step.assignee?.name ?? '—'}</div>
              <div className={`text-xs ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                {done ? `เสร็จ ${shortThaiDate(step.completedAt)}` : `กำหนด ${shortThaiDate(step.dueDate)}`}{overdue ? ' · เลยกำหนด' : ''}
                {step.status === 'PENDING_REVIEW' ? ' · รอตรวจ' : ''}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={showFiles}><Download className="mr-1 h-4 w-4" />{files ? 'ซ่อนไฟล์' : 'ไฟล์แต่ละขั้น'}</Button>
        {run.status === 'ACTIVE' && currentIndex > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setToStep(currentIndex - 1); setSendBack(true); }}>ส่งกลับไปขั้น…</Button>
        )}
        {run.status === 'ACTIVE' && (
          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}
            onClick={() => { if (window.confirm(`ยกเลิกสายงาน "${run.name}"? ขั้นที่ยังไม่เสร็จจะถูกลบ`)) act(() => api.cancelWorkflow(token, run.id)); }}>
            ยกเลิกสายงาน
          </Button>
        )}
      </div>

      {files && (
        <ul className="mt-2 space-y-1 text-sm">
          {files.map((group) => (
            <li key={group.taskId}>
              <span className="text-xs text-muted-foreground">ขั้น {group.step + 1}: </span>
              {group.files.length === 0 ? <span className="text-xs text-muted-foreground">ไม่มีไฟล์</span> : group.files.map((f) => (
                <button key={f.id} type="button" className="mr-3 text-primary underline-offset-2 hover:underline"
                  onClick={() => downloadTaskAttachment(token, group.taskId, f.id, f.filename).catch((e) => setError(e.message))}>
                  {f.filename} <span className="text-xs text-muted-foreground">({fileSize(f.size)})</span>
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}

      <Modal open={sendBack} onClose={() => setSendBack(false)} ariaLabel="ส่งสายงานกลับ">
        <div className="space-y-3 rounded-xl bg-card p-5">
          <h3 className="font-semibold">ส่งกลับให้แก้ — {run.name}</h3>
          <label className="block text-sm">
            กลับไปขั้น
            <select className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2" value={toStep} onChange={(e) => setToStep(Number(e.target.value))}>
              {run.steps.slice(0, Math.max(currentIndex, 0)).map((s, i) => <option key={s.taskId} value={i}>{i + 1}. {s.title} — {s.assignee?.name ?? '—'}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            เหตุผล (ผู้รับจะเห็น)
            <textarea className="mt-1 min-h-[80px] w-full rounded-md border border-input bg-card px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSendBack(false)}>ยกเลิก</Button>
            <Button disabled={busy || !reason.trim()} onClick={() => act(() => api.sendBackWorkflow(token, run.id, { toStep, reason: reason.trim() }))}>ส่งกลับ</Button>
          </div>
        </div>
      </Modal>
    </article>
  );
}
