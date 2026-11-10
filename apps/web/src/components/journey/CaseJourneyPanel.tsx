'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type CaseJourney } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { JourneyStepper } from './JourneyStepper';
import { NextStepBanner } from './NextStepBanner';
import { LockedStepCard } from './LockedStepCard';
import { StickyAdvanceBar } from './StickyAdvanceBar';
import { PreLitigationIntake } from './PreLitigationIntake';

export function CaseJourneyPanel({ token, caseId, intakeId, stage, tasksVersion, onChanged }: { token: string; caseId: string; intakeId?: string | null; stage: string | null; tasksVersion: unknown; onChanged: () => void }) {
  const [journey, setJourney] = useState<CaseJourney | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skipId, setSkipId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const requestId = useRef(0);
  const refresh = async () => {
    const request = ++requestId.current;
    try {
      const result = await api.getCaseJourney(token, caseId);
      if (request === requestId.current) { setJourney(result); setError(''); }
    } catch {
      if (request === requestId.current) setError('โหลดขั้นตอนคดีไม่สำเร็จ');
    }
  };
  useEffect(() => { void refresh(); }, [token, caseId, stage, tasksVersion]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); onChanged(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'ดำเนินการไม่สำเร็จ'); }
    finally { setBusy(false); }
  };
  if (!journey) return error ? <p role="alert" className="text-destructive">{error} <Button size="sm" variant="outline" onClick={refresh}>ลองใหม่</Button></p> : null;
  const current = journey.steps.findIndex((step) => step.state === 'current');
  const preLitPending = stage === 'PRE_LITIGATION' && !!intakeId && journey.preLitSteps?.some((step) => step.state !== 'done');
  const next = journey.steps.slice(current + 1).find((step) => step.state === 'locked');
  return <section className="mb-6 min-w-0 space-y-3" aria-label="เส้นทางคดี">
    <JourneyStepper steps={journey.steps} />
    {stage === 'PRE_LITIGATION' && intakeId && journey.preLitSteps?.length > 0 && <PreLitigationIntake id={intakeId} steps={journey.preLitSteps} onChanged={() => { void refresh(); onChanged(); }} />}
    {preLitPending && journey.preLitNext && <NextStepBanner next={journey.preLitNext} onGo={() => document.getElementById('intake-journey-focus')?.scrollIntoView({ behavior: 'smooth' })} />}
    {!preLitPending && journey.next && <NextStepBanner next={journey.next} onGo={() => document.getElementById('journey-tasks')?.scrollIntoView({ behavior: 'smooth' })} />}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!preLitPending && <div id="journey-tasks" className="space-y-3 rounded-lg border bg-card p-4"><h2 className="font-semibold">งานขั้น{journey.steps[current]?.label}</h2>
      {journey.currentTasks.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีงานในขั้นนี้</p>}
      {journey.currentTasks.map((task) => <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><div><p>{task.title}</p><p className="text-xs text-muted-foreground">{task.assigneeName ?? 'ยังไม่มอบหมาย'}{task.dueDate && ` · ${new Date(task.dueDate).toLocaleDateString('th-TH')}`}{task.skippedReason && ` · ข้าม: ${task.skippedReason}`}</p></div>{task.status === 'DONE' ? <span className="text-sm text-success">เสร็จแล้ว</span> : !task.skippedReason && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => run(() => api.updateTask(token, caseId, task.id, { status: 'DONE' }))}>เสร็จแล้ว</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setSkipId(task.id); setReason(''); }}>ข้าม (ระบุเหตุผล)</Button></div>}</div>)}
    </div>}
    {journey.steps.filter((step) => step.state === 'locked').map((step) => <LockedStepCard key={step.key} step={step} />)}
    {skipId && <div role="dialog" aria-modal="true" aria-labelledby="skip-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-md space-y-3 rounded-lg bg-background p-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.skipJourneyTask(token, skipId, reason.trim()); setSkipId(null); }); }}><h2 id="skip-title" className="font-semibold">เหตุผลที่ข้ามงาน</h2><textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border bg-background p-2" /><div className="flex gap-2"><Button disabled={busy || reason.trim().length < 3}>ยืนยัน</Button><Button type="button" variant="outline" onClick={() => setSkipId(null)}>ยกเลิก</Button></div></form></div>}
    <StickyAdvanceBar><div><span>ขั้นที่ {current + 1} จาก {journey.steps.length}</span>{!journey.canAdvance && <p className="text-xs text-muted-foreground">{journey.blockers.join(' · ')}</p>}</div><div className="flex flex-wrap gap-2">{journey.steps[current]?.key === 'AWAITING_JUDGMENT' && <Button size="sm" variant="outline" disabled={busy || !journey.canAdvance} onClick={() => run(() => api.advanceCaseJourney(token, caseId, 'APPEAL'))}>อุทธรณ์</Button>}{journey.steps[current]?.key === 'APPEAL' && <Button size="sm" variant="outline" disabled={busy || !journey.canAdvance} onClick={() => run(() => api.advanceCaseJourney(token, caseId, 'SUPREME'))}>ฎีกา</Button>}{next && <Button disabled={busy || !journey.canAdvance} onClick={() => run(() => api.advanceCaseJourney(token, caseId))}>ไปขั้น{next.label}</Button>}</div></StickyAdvanceBar>
  </section>;
}
