'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type CaseJourney } from '@/lib/api';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StepTracker } from '@/components/process/StepTracker';
import { NextActionCard } from '@/components/process/NextActionCard';
import { daysUntil } from '@/components/process/helpers';
import { UndoToast, type UndoAction } from '@/components/ui/UndoToast';
import { CasePreLitigation } from './CasePreLitigation';

type Props = { token: string; caseId: string; intakeId?: string | null; partyNames: string[]; stage: string | null; tasksVersion: unknown; onChanged: () => void; onEdit: (missing?: string[]) => void; onOpenTask: (id: string) => void; onAdvance: (stage: string, explicit?: 'APPEAL' | 'SUPREME') => void; onJourney?: (journey: CaseJourney) => void; tasksOnly?: boolean; taskCount?: number };

export function CaseJourneyPanel({ token, caseId, intakeId, partyNames, stage, tasksVersion, onChanged, onEdit, onOpenTask, onAdvance, onJourney, tasksOnly, taskCount }: Props) {
  const [journey, setJourney] = useState<CaseJourney | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skipId, setSkipId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [showPreLit, setShowPreLit] = useState(false);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const requestId = useRef(0);
  const onJourneyRef = useRef(onJourney);
  onJourneyRef.current = onJourney;
  const refresh = async () => {
    const request = ++requestId.current;
    try { const result = await api.getCaseJourney(token, caseId); if (request === requestId.current) { setJourney(result); onJourneyRef.current?.(result); setError(''); } }
    catch { if (request === requestId.current) setError('โหลดขั้นตอนคดีไม่สำเร็จ'); }
  };
  useEffect(() => { void refresh(); return () => { requestId.current++; }; }, [token, caseId, stage, tasksVersion]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); await refresh(); onChanged(); return true; }
    catch (e) { setError(e instanceof ApiError ? e.message : 'ดำเนินการไม่สำเร็จ'); return false; }
    finally { setBusy(false); }
  };
  const completeTask = async (id: string, title: string, previous: string, nextTitle?: string) => {
    if (!(await run(() => api.updateTask(token, caseId, id, { status: 'DONE' })))) return;
    setUndo({ message: `ทำเสร็จแล้ว: ${title}`, detail: nextTitle ? `งานถัดไป: ${nextTitle}` : undefined, undo: async () => { await api.updateTask(token, caseId, id, { status: previous }); await refresh(); onChanged(); } });
  };
  if (!journey) return error ? <p role="alert" className="text-destructive">{error} <Button variant="outline" onClick={refresh}>ลองใหม่</Button></p> : <p aria-busy="true">กำลังโหลดขั้นตอนคดี…</p>;
  const current = journey.steps.findIndex((step) => step.state === 'current');
  const next = journey.steps.slice(current + 1).find((step) => step.state === 'locked');
  const pending = journey.currentTasks.filter((task) => task.status !== 'DONE' && !task.skippedReason).sort((a, b) => (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity));
  const task = journey.next?.kind === 'TASK' ? pending[0] : undefined;
  const nextTask = pending[1];
  const total = journey.currentTasks.length;
  const done = total - pending.length;
  const date = (value: string) => new Date(value).toLocaleDateString('th-TH');
  const days = task?.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = pending.some((item) => item.dueDate && (daysUntil(item.dueDate) ?? 0) < 0);
  if (tasksOnly) return <section className="mb-4 rounded-lg border bg-card p-4 shadow-sm">{journey.preLitSteps.length > 0 && <details className="mb-4"><summary className="min-h-11 cursor-pointer font-semibold">รายการตรวจก่อนฟ้อง</summary><CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps} onEdit={() => onEdit()} onChanged={() => { void refresh(); onChanged(); }} /></details>}<h2 className="font-semibold">งานในขั้นนี้</h2><p className="text-sm text-muted-foreground">ข้ามงานที่ไม่จำเป็นพร้อมระบุเหตุผล</p>{pending.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><span>{item.title}</span><Button variant="outline" disabled={busy} onClick={() => { setSkipId(item.id); setReason(''); }}>ข้ามงาน</Button></div>)}{error && <p role="alert" className="text-destructive">{error}</p>}{skipId && <div role="dialog" aria-modal="true" aria-labelledby="skip-title" onKeyDown={(e) => { if (e.key === 'Escape') setSkipId(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-md space-y-3 rounded-lg bg-background p-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.skipJourneyTask(token, skipId, reason.trim()); setSkipId(null); }); }}><h2 id="skip-title" className="font-semibold">เหตุผลที่ข้ามงาน</h2><textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border bg-background p-2" /><div className="flex gap-2"><Button disabled={busy || reason.trim().length < 3}>ยืนยัน</Button><Button type="button" variant="outline" onClick={() => setSkipId(null)}>ยกเลิก</Button></div></form></div>}</section>;
  const action = journey.next?.kind === 'INFO' ? <div className="space-y-3"><h2 className="text-xl font-bold">เติมข้อมูลคดีให้ครบ</h2><ul className="list-disc pl-5">{journey.infoMissing.map((item) => <li key={item}>{item}</li>)}</ul><Button onClick={() => onEdit(journey.infoMissing)}>กรอกเลย</Button><p className="text-sm text-muted-foreground">เปิดแบบแก้ไขข้อมูลคดีเพื่อกรอกข้อมูลที่ขาด</p></div> : journey.next?.kind === 'PRELIT' ? <div className="space-y-3"><h2 className="text-xl font-bold">{journey.next.text}</h2><Button onClick={() => journey.preLitSteps.find((step) => step.state !== 'done')?.key === 'INFO' ? onEdit() : setShowPreLit(true)}>ทำเลย</Button><p className="text-sm text-muted-foreground">เปิดรายการที่ต้องทำก่อนฟ้อง</p>{showPreLit && <CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps.filter((step) => step.key === journey.preLitSteps.find((item) => item.state !== 'done')?.key)} onEdit={() => onEdit()} onChanged={() => { void refresh(); onChanged(); }} />}</div> : task ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">{task.title}</h2><p className={`text-sm ${days !== null && days < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{task.dueDate && days !== null && (days < 0 ? `เลยกำหนดมา ${-days} วัน (ครบ ${date(task.dueDate)})` : `ครบ ${date(task.dueDate)} · อีก ${days} วัน`)}{task.dueDate && ' · '}คนทำ: {task.assigneeName ?? 'ยังไม่มอบหมาย'}</p></div><div className="space-y-2"><div className="flex flex-wrap gap-2"><Button onClick={() => onOpenTask(task.id)}>เปิดงานนี้ <ArrowRight aria-hidden="true" className="h-4 w-4" /></Button><Button variant="outline" disabled={busy} onClick={() => void completeTask(task.id, task.title, task.status, nextTask?.title)}><Check aria-hidden="true" className="h-4 w-4" />ทำเสร็จแล้ว</Button></div><p className="max-w-sm text-xs text-muted-foreground">“เปิดงานนี้” ดูรายละเอียด แนบไฟล์ หรือส่งต่อให้คนอื่น · “ทำเสร็จแล้ว” กดเมื่องานเสร็จ ระบบจะขึ้นงานถัดไปให้</p></div></div> : journey.canAdvance && next ? <div className="space-y-3"><h2 className="text-xl font-bold">งานขั้น{journey.steps[current]?.label}ครบแล้ว</h2><Button disabled={busy} onClick={() => onAdvance(next.key)}>ไปขั้น{next.label} <ArrowRight aria-hidden="true" className="h-4 w-4" /></Button><p className="text-sm text-muted-foreground">ตรวจสอบงานแนะนำก่อนย้ายขั้น</p></div> : <p>{journey.next?.text ?? 'ยังไม่มีรายการถัดไป'}</p>;
  return <section className="space-y-4" aria-label="เส้นทางคดี">
    <UndoToast action={undo} onDismiss={() => setUndo(null)} />
    <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm"><p className="text-sm text-muted-foreground"><strong className="text-foreground">ขั้นตอนของคดี</strong> · สีเขียว = ผ่านแล้ว · สีน้ำเงินเข้ม = ขั้นปัจจุบัน</p><StepTracker steps={journey.steps.map((step) => ({ ...step, state: step.state === 'locked' ? 'todo' : step.state }))} /></div>
    <NextActionCard eyebrow={`ต้องทำตอนนี้${journey.steps[current]?.label ? ` · ขั้น${journey.steps[current].label}` : ''}`} tone={overdue ? 'overdue' : journey.next?.kind === 'INFO' ? 'info' : journey.canAdvance ? 'ready' : 'default'} action={action} footer={<><span>งานในขั้นนี้ เสร็จ {done}/{total}</span><span aria-hidden="true" className="flex w-20 gap-1">{Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-2 flex-1 rounded-full ${total && index < Math.round(done / total * 5) ? 'bg-success' : 'bg-muted'}`} />)}</span>{nextTask && <span>งานถัดไป: {nextTask.title}{nextTask.dueDate && ` · ครบ ${date(nextTask.dueDate)}`}</span>}<Link className="min-h-11 content-center text-primary underline" href={`/cases/${caseId}?tab=tasks`}>ดูงานทั้งหมด ({taskCount ?? total})</Link></>} />
    {journey.canAdvance && <div className="flex flex-wrap gap-2">{journey.steps[current]?.key === 'AWAITING_JUDGMENT' && <Button variant="outline" onClick={() => onAdvance('APPEAL', 'APPEAL')}>อุทธรณ์</Button>}{journey.steps[current]?.key === 'APPEAL' && <Button variant="outline" onClick={() => onAdvance('SUPREME', 'SUPREME')}>ฎีกา</Button>}</div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
