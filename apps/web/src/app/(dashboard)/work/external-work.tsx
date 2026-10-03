'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Download, Paperclip, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type ExternalStep } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fileSize, saveBlob, shortThaiDate } from '@/components/workflows/workflow-ui';

/** The whole app, for a freelancer: their own workflow steps and nothing else. */
export default function ExternalWorkPage() {
  const { token, user } = useAuth();
  const [steps, setSteps] = useState<ExternalStep[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    api.getExternalSteps(token).then(setSteps).catch((e) => setError(e.message));
  }, [token]);
  useEffect(load, [load]);

  if (!token) return null;
  const open = steps?.filter((s) => s.status !== 'DONE' && s.status !== 'PENDING_REVIEW') ?? [];
  const handedIn = steps?.filter((s) => s.status === 'DONE' || s.status === 'PENDING_REVIEW') ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">งานของฉัน</h1>
        <p className="mt-1 text-sm text-muted-foreground">สวัสดี คุณ{user?.firstName ?? ''} — งานที่สำนักงานส่งมาให้คุณทำ</p>
      </header>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!steps && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {steps && !steps.length && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">ยังไม่มีงานที่มอบหมายให้คุณ</p>}
      {open.map((step) => <StepCard key={step.taskId} step={step} token={token} onChanged={load} />)}
      {handedIn.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">ส่งแล้ว ({handedIn.length})</summary>
          <div className="mt-3 space-y-4">{handedIn.map((step) => <StepCard key={step.taskId} step={step} token={token} onChanged={load} />)}</div>
        </details>
      )}
    </div>
  );
}

function StepCard({ step, token, onChanged }: { step: ExternalStep; token: string; onChanged: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const handedIn = step.status === 'DONE' || step.status === 'PENDING_REVIEW';
  const overdue = !handedIn && step.dueDate && new Date(step.dueDate) < new Date();

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  const download = (attachmentId: string, filename: string) =>
    api.downloadExternalFile(token, attachmentId).then((blob) => saveBlob(blob, filename)).catch((e) => setError(e.message));

  return (
    <article className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{step.title}</h2>
        {step.status === 'DONE' && <Badge variant="success">ส่งแล้ว</Badge>}
        {step.status === 'PENDING_REVIEW' && <Badge variant="warning">ส่งแล้ว · รอตรวจ</Badge>}
        {step.blocked && !handedIn && <Badge variant="muted"><Clock className="mr-1 h-3 w-3" />รอขั้นก่อนหน้า</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {step.run.name} · คดี {step.run.caseRef} ·{' '}
        <span className={overdue ? 'font-medium text-destructive' : ''}>กำหนดส่ง {shortThaiDate(step.dueDate)}{overdue ? ' (เลยกำหนด)' : ''}</span>
      </p>
      {step.instructions && <p className="mt-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{step.instructions}</p>}

      <section className="mt-4">
        <h3 className="mb-1 text-sm font-medium">ไฟล์จากขั้นก่อน</h3>
        {step.blocked ? (
          <p className="text-sm text-muted-foreground">ไฟล์จะมาเมื่อขั้นก่อนหน้าส่งงาน — ระบบจะแจ้งเตือนคุณ</p>
        ) : step.inputs.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีไฟล์</p>
        ) : (
          <ul className="space-y-1">
            {step.inputs.map((f) => (
              <li key={f.attachmentId}>
                <button type="button" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => download(f.attachmentId, f.filename)}>
                  <Download className="h-4 w-4" />{f.filename} <span className="text-xs text-muted-foreground">({fileSize(f.size)})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="mb-1 text-sm font-medium">ไฟล์งานของฉัน</h3>
        {step.outputs.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่ได้แนบไฟล์</p>}
        <ul className="space-y-1">
          {step.outputs.map((f) => (
            <li key={f.attachmentId} className="flex items-center gap-2 text-sm">
              <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => download(f.attachmentId, f.filename)}>
                <Paperclip className="h-4 w-4" />{f.filename}
              </button>
              <span className="text-xs text-muted-foreground">({fileSize(f.size)})</span>
              {!handedIn && (
                <Button size="icon" variant="ghost" aria-label={`ลบ ${f.filename}`} disabled={busy}
                  onClick={() => run(() => api.deleteExternalFile(token, f.attachmentId))}><Trash2 className="h-4 w-4" /></Button>
              )}
            </li>
          ))}
        </ul>
        {!handedIn && (
          <>
            <input ref={fileInput} type="file" hidden accept=".pdf,.docx,.xlsx,.txt,image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) run(() => api.uploadExternalFile(token, step.taskId, file));
              }} />
            <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => fileInput.current?.click()}>
              <Upload className="mr-1 h-4 w-4" />แนบไฟล์ (PDF, Word, Excel, รูป ไม่เกิน 30MB)
            </Button>
          </>
        )}
      </section>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      {!handedIn && (
        <div className="mt-4 border-t pt-4">
          <Button className="w-full sm:w-auto" disabled={busy || step.blocked}
            onClick={() => {
              if (!step.outputs.length && !window.confirm('ยังไม่ได้แนบไฟล์งาน ส่งงานเลยไหม?')) return;
              run(() => api.completeExternalStep(token, step.taskId));
            }}>
            <CheckCircle2 className="mr-1 h-4 w-4" />{step.blocked ? 'รอขั้นก่อนหน้า' : 'ส่งงาน / เสร็จแล้ว'}
          </Button>
        </div>
      )}
    </article>
  );
}
