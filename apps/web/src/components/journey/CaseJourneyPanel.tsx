'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type CaseJourney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { StepTracker } from '@/components/process/StepTracker';
import { NextActionCard } from '@/components/process/NextActionCard';
import { dueLabel } from '@/components/process/helpers';
import { CasePreLitigation } from './CasePreLitigation';

export function CaseJourneyPanel({ token, caseId, intakeId, partyNames, stage, tasksVersion, onChanged, onEdit, onOpenTask }: { token: string; caseId: string; intakeId?: string | null; partyNames: string[]; stage: string | null; tasksVersion: unknown; onChanged: () => void; onEdit: (missing?: string[]) => void; onOpenTask: (id: string) => void }) {
  const [journey, setJourney] = useState<CaseJourney | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skipId, setSkipId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showPreLit, setShowPreLit] = useState(false);
  const requestId = useRef(0);
  const refresh = async () => {
    const request = ++requestId.current;
    try { const result = await api.getCaseJourney(token, caseId); if (request === requestId.current) { setJourney(result); setError(''); } }
    catch { if (request === requestId.current) setError('โหลดขั้นตอนคดีไม่สำเร็จ'); }
  };
  useEffect(() => { void refresh(); return () => { requestId.current++; }; }, [token, caseId, stage, tasksVersion]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); onChanged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'ดำเนินการไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  if (!journey) return error ? <p role="alert" className="text-destructive">{error} <Button variant="outline" onClick={refresh}>ลองใหม่</Button></p> : <p aria-busy="true">กำลังโหลดขั้นตอนคดี…</p>;
  const current = journey.steps.findIndex((step) => step.state === 'current');
  const next = journey.steps.slice(current + 1).find((step) => step.state === 'locked');
  const pending = journey.currentTasks.filter((task) => task.status !== 'DONE' && !task.skippedReason).sort((a, b) => (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity));
  const task = journey.next?.kind === 'TASK' ? pending[0] : undefined;
  const others = journey.currentTasks.filter((item) => item.id !== task?.id);
  const due = task?.dueDate ? dueLabel(task.dueDate) : null;
  const action = journey.next?.kind === 'INFO' ? <div className="space-y-3"><h3 className="text-xl font-semibold">เติมข้อมูลคดีให้ครบ</h3><ul className="list-disc pl-5">{journey.infoMissing.map((item) => <li key={item}>{item}</li>)}</ul><Button onClick={() => onEdit(journey.infoMissing)}>กรอกเลย →</Button></div> : journey.next?.kind === 'PRELIT' ? <div className="space-y-3"><h3 className="text-xl font-semibold">{journey.next.text}</h3><Button onClick={() => journey.preLitSteps.find((step) => step.state !== 'done')?.key === 'INFO' ? onEdit() : setShowPreLit(true)}>ทำเลย →</Button>{showPreLit && <CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps.filter((step) => step.key === journey.preLitSteps.find((item) => item.state !== 'done')?.key)} onEdit={() => onEdit()} onChanged={() => { void refresh(); onChanged(); }} />}</div> : task ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-4"><div><h3 className="text-xl font-semibold">{task.title}</h3>{due && <p className={due.urgent ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{task.dueDate && `ครบ ${new Date(task.dueDate).toLocaleDateString('th-TH')} · `}{due.text}</p>}<p className="text-sm text-muted-foreground">ผู้รับผิดชอบ: {task.assigneeName ?? 'ยังไม่มอบหมาย'}</p></div><Button onClick={() => onOpenTask(task.id)}>ทำเลย →</Button></div> : journey.canAdvance && next ? <div className="space-y-3"><h3 className="text-xl font-semibold">งานขั้น{journey.steps[current]?.label}ครบแล้ว</h3><Button disabled={busy} onClick={() => void run(() => api.advanceCaseJourney(token, caseId))}>ไปขั้น{next.label} →</Button></div> : <p>{journey.next?.text ?? 'ยังไม่มีรายการถัดไป'}</p>;
  return <section className="space-y-4" aria-label="เส้นทางคดี">
    <div className="space-y-3 rounded-lg border bg-card p-4"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">ลำดับขั้นตอนการดำเนินคดี</h2><span className="rounded-full bg-muted px-3 py-1 text-sm">ขั้นที่ {current + 1}/{journey.steps.length} · {journey.steps[current]?.label}</span></div><StepTracker steps={journey.steps.map((step) => ({ ...step, state: step.state === 'locked' ? 'todo' : step.state }))} /></div>
    <NextActionCard otherCount={others.length} current={journey.next?.done ?? journey.currentTasks.filter((item) => item.status === 'DONE' || item.skippedReason).length} total={journey.next?.total ?? journey.currentTasks.length} action={action} footer={!journey.canAdvance && next ? <>ทำครบทุกงานแล้ว จึงไปขั้น{next.label}ได้</> : undefined}>
      {journey.next?.kind === 'PRELIT' && <CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps} onEdit={() => onEdit()} onChanged={() => { void refresh(); onChanged(); }} />}
      {others.length > 0 && <div className="space-y-2"><p className="text-sm text-muted-foreground">{others.length} รายการ</p>{others.map((item) => { const done = item.status === 'DONE' || !!item.skippedReason; return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><label className="flex items-center gap-2"><input type="checkbox" checked={done} disabled={busy || done} onChange={() => void run(() => api.updateTask(token, caseId, item.id, { status: 'DONE' }))} /><span className={done ? 'text-muted-foreground line-through' : ''}>{item.title}{item.skippedReason && ` · ข้าม: ${item.skippedReason}`}</span></label>{!done && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { setSkipId(item.id); setReason(''); }}>ข้าม</Button></div>}</div>; })}</div>}
    </NextActionCard>
    {journey.canAdvance && <div className="flex gap-2">{journey.steps[current]?.key === 'AWAITING_JUDGMENT' && <Button variant="outline" disabled={busy} onClick={() => void run(() => api.advanceCaseJourney(token, caseId, 'APPEAL'))}>อุทธรณ์</Button>}{journey.steps[current]?.key === 'APPEAL' && <Button variant="outline" disabled={busy} onClick={() => void run(() => api.advanceCaseJourney(token, caseId, 'SUPREME'))}>ฎีกา</Button>}</div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {skipId && <div role="dialog" aria-modal="true" aria-labelledby="skip-title" onKeyDown={(e) => { if (e.key === 'Escape') setSkipId(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-md space-y-3 rounded-lg bg-background p-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.skipJourneyTask(token, skipId, reason.trim()); setSkipId(null); }); }}><h2 id="skip-title" className="font-semibold">เหตุผลที่ข้ามงาน</h2><textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border bg-background p-2" /><div className="flex gap-2"><Button disabled={busy || reason.trim().length < 3}>ยืนยัน</Button><Button type="button" variant="outline" onClick={() => setSkipId(null)}>ยกเลิก</Button></div></form></div>}
  </section>;
}
