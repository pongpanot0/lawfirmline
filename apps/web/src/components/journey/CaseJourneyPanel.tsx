'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type CaseJourney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CasePreLitigation } from './CasePreLitigation';
import { remainingCount, stepLabel } from './case-journey-helpers';

export function CaseJourneyPanel({ token, caseId, intakeId, partyNames, stage, tasksVersion, onChanged, onEdit }: { token: string; caseId: string; intakeId?: string | null; partyNames: string[]; stage: string | null; tasksVersion: unknown; onChanged: () => void; onEdit: () => void }) {
  const [journey, setJourney] = useState<CaseJourney | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skipId, setSkipId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
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
  return <section className="contents" aria-label="เส้นทางคดี">
    <ol className="flex min-w-0 gap-1 rounded-lg border bg-card p-2 sm:p-3 xl:col-span-2" aria-label="ขั้นตอนคดี">{journey.steps.map((step, index) => <li key={step.key} title={stepLabel(step)} aria-current={step.state === 'current' ? 'step' : undefined} className={`min-w-0 flex-1 text-center text-xs ${step.state === 'current' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}><span className={`mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full ${step.state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{step.state === 'done' && !step.skippedAtOpen ? '✓' : index + 1}</span><span className={`${step.state === 'current' ? 'block' : 'sr-only sm:not-sr-only sm:block'} break-words`}>{step.label}</span>{step.skippedAtOpen && <span className="sr-only sm:not-sr-only sm:block sm:break-words sm:text-[10px]">ข้ามตอนเปิดคดี</span>}</li>)}</ol>
    <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{journey.steps[current]?.label} — สิ่งที่ต้องทำ</h2><span className="rounded-full bg-muted px-3 py-1 text-sm">เหลือ {remainingCount(journey.preLitSteps, journey.currentTasks)} รายการ</span></div>
      {journey.preLitSteps.length > 0 && <CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps} onEdit={onEdit} onChanged={() => { void refresh(); onChanged(); }} />}
      <div className="space-y-2"><h3 className="font-semibold">งานขั้น{journey.steps[current]?.label}</h3>{journey.currentTasks.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีงานในขั้นนี้</p>}
      {journey.currentTasks.map((task) => { const done = task.status === 'DONE' || !!task.skippedReason; return <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3"><div className="min-w-0"><p className={done ? 'break-words text-muted-foreground line-through' : 'break-words'}>{done && '✓ '}{task.title}</p><p className="text-xs text-muted-foreground">{done ? task.skippedReason ? `ข้าม: ${task.skippedReason}` : 'เสร็จแล้ว' : <>{task.assigneeName ?? 'ยังไม่มอบหมาย'}{task.dueDate && ` · ${new Date(task.dueDate).toLocaleDateString('th-TH')}`}</>}</p></div>{!done && <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => void run(() => api.updateTask(token, caseId, task.id, { status: 'DONE' }))}>เสร็จแล้ว</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setSkipId(task.id); setReason(''); }}>ข้าม (ระบุเหตุผล)</Button></div>}</div>; })}</div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2 border-t pt-4"><div className="flex flex-wrap gap-2">{journey.steps[current]?.key === 'AWAITING_JUDGMENT' && <Button variant="outline" disabled={busy || !journey.canAdvance} onClick={() => void run(() => api.advanceCaseJourney(token, caseId, 'APPEAL'))}>อุทธรณ์</Button>}{journey.steps[current]?.key === 'APPEAL' && <Button variant="outline" disabled={busy || !journey.canAdvance} onClick={() => void run(() => api.advanceCaseJourney(token, caseId, 'SUPREME'))}>ฎีกา</Button>}{next && <Button disabled={busy || !journey.canAdvance} onClick={() => void run(() => api.advanceCaseJourney(token, caseId))}>{busy ? 'กำลังบันทึก…' : `ไปขั้น${next.label} →`}</Button>}</div>{!journey.canAdvance && journey.blockers[0] && <p className="text-xs text-destructive">{journey.blockers[0]}</p>}{next && !journey.canAdvance && <p className="text-xs text-muted-foreground">ทำงานให้เสร็จหรือข้ามพร้อมเหตุผลก่อนไปขั้นถัดไป</p>}</div>
    </div>
    {skipId && <div role="dialog" aria-modal="true" aria-labelledby="skip-title" onKeyDown={(e) => { if (e.key === 'Escape') setSkipId(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-md space-y-3 rounded-lg bg-background p-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.skipJourneyTask(token, skipId, reason.trim()); setSkipId(null); }); }}><h2 id="skip-title" className="font-semibold">เหตุผลที่ข้ามงาน</h2><textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border bg-background p-2" /><div className="flex gap-2"><Button disabled={busy || reason.trim().length < 3}>ยืนยัน</Button><Button type="button" variant="outline" onClick={() => setSkipId(null)}>ยกเลิก</Button></div></form></div>}
  </section>;
}
