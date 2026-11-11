'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type CaseJourney } from '@/lib/api';
import { Archive, ArrowRight, Check, Pause, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NextActionCard } from '@/components/process/NextActionCard';
import { daysUntil } from '@/components/process/helpers';
import { UndoToast, type UndoAction } from '@/components/ui/UndoToast';
import { CasePreLitigation } from './CasePreLitigation';

type Props = { token: string; caseId: string; intakeId?: string | null; partyNames: string[]; stage: string | null; tasksVersion: unknown; onChanged: () => void; onEdit: (missing?: string[]) => void; onOpenTask: (id: string) => void; onAdvance: (stage: string, explicit?: 'APPEAL' | 'SUPREME') => void; onJourney?: (journey: CaseJourney) => void; tasksOnly?: boolean; taskCount?: number; compact?: boolean; onCloseCase?: () => void; onReopenCase?: () => void; reopening?: boolean; closed?: { at: string | null; summary: string | null } | null; idleDays?: number | null };

export function CaseJourneyPanel({ token, caseId, intakeId, partyNames, stage, tasksVersion, onChanged, onEdit, onOpenTask, onAdvance, onJourney, tasksOnly, taskCount, compact, onCloseCase, onReopenCase, reopening, closed, idleDays }: Props) {
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
    setUndo({ message: `ทำ “${title}” เสร็จแล้ว`, detail: nextTitle ? `งานถัดไป: ${nextTitle}` : undefined, undo: async () => { await api.updateTask(token, caseId, id, { status: previous }); await refresh(); onChanged(); } });
  };
  if (!journey) return error ? <p role="alert" className="text-destructive">{error} <Button variant="outline" onClick={refresh}>ลองใหม่</Button></p> : <p aria-busy="true">กำลังโหลดขั้นตอนคดี…</p>;
  const current = journey.steps.findIndex((step) => step.state === 'current');
  const next = journey.steps.slice(current + 1).find((step) => step.state === 'locked');
  const pending = journey.currentTasks.filter((task) => task.status !== 'DONE' && !task.skippedReason).sort((a, b) => (a.dueDate ? Date.parse(a.dueDate) : Infinity) - (b.dueDate ? Date.parse(b.dueDate) : Infinity));
  const task = journey.next?.kind === 'TASK' ? pending[0] : undefined;
  const nextTask = pending[1];
  const total = journey.currentTasks.length;
  const done = total - pending.length;
  const date = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  const days = task?.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = pending.some((item) => item.dueDate && (daysUntil(item.dueDate) ?? 0) < 0);
  if (tasksOnly) return <section className="">{journey.preLitSteps.length > 0 && <details className="mb-4"><summary className="min-h-11 cursor-pointer font-semibold">รายการตรวจก่อนฟ้อง</summary><CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps} onEdit={() => onEdit()} onChanged={() => { void refresh(); onChanged(); }} /></details>}<h2 className="font-semibold">งานในขั้นนี้</h2><p className="text-sm text-muted-foreground">ข้ามงานที่ไม่จำเป็นพร้อมระบุเหตุผล</p>{pending.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2"><span>{item.title}</span><Button variant="outline" disabled={busy} onClick={() => { setSkipId(item.id); setReason(''); }}>ข้ามงาน</Button></div>)}{error && <p role="alert" className="text-destructive">{error}</p>}{skipId && <div role="dialog" aria-modal="true" aria-labelledby="skip-title" onKeyDown={(e) => { if (e.key === 'Escape') setSkipId(null); }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-md space-y-3 rounded-lg bg-background p-5" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.skipJourneyTask(token, skipId, reason.trim()); setSkipId(null); }); }}><h2 id="skip-title" className="font-semibold">เหตุผลที่ข้ามงาน</h2><textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-md border bg-background p-2" /><div className="flex gap-2"><Button disabled={busy || reason.trim().length < 3}>ยืนยัน</Button><Button type="button" variant="outline" onClick={() => setSkipId(null)}>ยกเลิก</Button></div></form></div>}</section>;
  const action = journey.next?.kind === 'INFO' ? <div className="space-y-3"><h2 className="text-2xl font-bold">เติมข้อมูลคดีให้ครบ</h2><ul className="list-disc pl-5">{journey.infoMissing.map((item) => <li key={item}>{item}</li>)}</ul><Button onClick={() => onEdit(journey.infoMissing)}>กรอกเลย</Button><p className="text-sm text-muted-foreground">เปิดแบบแก้ไขข้อมูลคดีเพื่อกรอกข้อมูลที่ขาด</p></div> : journey.next?.kind === 'PRELIT' ? <div className="space-y-3"><h2 className="text-2xl font-bold">{journey.next.text}</h2><Button onClick={() => journey.preLitSteps.find((step) => step.state !== 'done')?.key === 'INFO' ? onEdit() : setShowPreLit(true)}>ทำเลย</Button><p className="text-sm text-muted-foreground">เปิดรายการที่ต้องทำก่อนฟ้อง</p>{showPreLit && <CasePreLitigation token={token} caseId={caseId} intakeId={intakeId} partyNames={partyNames} steps={journey.preLitSteps.filter((step) => step.key === journey.preLitSteps.find((item) => item.state !== 'done')?.key)} onEdit={() => onEdit()} onChanged={() => { void refresh(); onChanged(); }} />}</div> : task ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="mt-1 text-2xl font-bold">{task.title}</h2><p className="mt-1">{task.dueDate && days !== null && (days < 0 ? <b className="text-[#a83232]">เลยกำหนดมา {-days} วัน (ครบ {date(task.dueDate)})</b> : <b>ครบ {date(task.dueDate)} · อีก {days} วัน</b>)} <span className="text-muted-foreground">{task.dueDate && '· '}คนทำ: {task.assigneeName ?? 'ยังไม่มอบหมาย'}</span></p></div><div className="space-y-2"><div className="flex flex-wrap gap-2"><Button onClick={() => onOpenTask(task.id)}>เปิดงานนี้ <ArrowRight aria-hidden="true" className="h-4 w-4" /></Button><Button variant="outline" disabled={busy} onClick={() => void completeTask(task.id, task.title, task.status, nextTask?.title)}><Check aria-hidden="true" className="h-4 w-4" />ทำเสร็จแล้ว</Button></div><p className="mt-1 max-w-[22rem] text-[.82rem] leading-[1.45] text-muted-foreground">“เปิดงานนี้” ดูรายละเอียด แนบไฟล์ หรือส่งต่อให้คนอื่น · “ทำเสร็จแล้ว” กดเมื่องานเสร็จ ระบบจะขึ้นงานถัดไปให้</p></div></div> : journey.canAdvance && next ? <><div className="mt-1 flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-2xl font-bold"><Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" />งานขั้น{journey.steps[current]?.label}ครบแล้ว ({done}/{total})</h2><p className="mt-1 text-muted-foreground">ทำงานขั้นนี้ครบทุกงานและข้อมูลคดีครบแล้ว</p><p className="mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground">กดปุ่มเพื่อย้ายคดีไปขั้น{next.label} ระบบจะแนะนำงานของขั้นใหม่ให้เลือกสร้าง</p></div><button type="button" disabled={busy} onClick={() => onAdvance(next.key)} className="inline-flex min-h-11 items-center justify-center gap-[.4rem] rounded-lg bg-[#227052] px-4 text-lg font-semibold text-white disabled:opacity-60">ไปขั้น{next.label} <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button></div><Link className="mt-4 inline-flex items-center gap-1 text-sm font-semibold underline" href={`/cases/${caseId}?tab=tasks`}>ดูงานที่ทำแล้ว ({done}) <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></Link></> : <p>{journey.next?.text ?? 'ยังไม่มีรายการถัดไป'}</p>;
  const hint = 'mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground';
  const outlineBtn = 'inline-flex min-h-11 items-center justify-center gap-[.4rem] rounded-lg border border-[#c9ccc6] bg-white px-4 text-[.95rem] font-semibold text-[#142e43] disabled:opacity-60';
  if (closed && !tasksOnly) return <section aria-label="เส้นทางคดี" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-[#e2e0d8] bg-[#f7f5ef] p-5 shadow-[0_6px_20px_rgba(20,46,67,.06)]">
    <div className="min-w-0"><p className="text-sm font-semibold text-muted-foreground">คดีปิดแล้ว{closed.at ? ` · ${new Date(closed.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' })}` : ''}</p><h2 className="mt-1 text-2xl font-bold">{closed.summary?.split(' — ')[0] || 'ปิดคดีแล้ว'}</h2>{closed.summary?.includes(' — ') && <p className={hint}>“{closed.summary.split(' — ').slice(1).join(' — ')}”</p>}</div>
    {onReopenCase && <div><button type="button" disabled={reopening} onClick={onReopenCase} className={outlineBtn}><RotateCcw aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{reopening ? 'กำลังเปิดคืน…' : 'เปิดคดีอีกครั้ง'}</button><p className={`${hint} max-w-[14rem]`}>ลูกความกลับมา? เปิดคืนแล้วทำต่อจากขั้นเดิมได้เลย</p></div>}
  </section>;
  const resting = !tasksOnly && !pending.length && journey.next?.kind !== 'INFO' && journey.next?.kind !== 'PRELIT' && (!next || next.key === 'CLOSING');
  if (resting) return <section aria-label="เส้นทางคดี" className="rounded-xl border-2 border-[#c9d6e3] bg-[#f3f7fb] p-5 shadow-[0_6px_20px_rgba(20,46,67,.08)]">
    <p className="text-sm font-semibold text-[#2b5a8a]">ตอนนี้ไม่มีงานค้าง</p>
    <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl"><h2 className="flex items-center gap-2 text-2xl font-bold"><Pause aria-hidden="true" className="h-[1.1em] w-[1.1em]" />คดีพักไว้ — รอลูกความแจ้ง</h2><p className="mt-1 text-muted-foreground">ทำงานที่ต้องทำครบแล้ว คดียังเปิดไว้ เผื่อลูกความกลับมาให้ทำต่อ</p><p className={hint}>ไม่ต้องปิดคดีเอง — ปิดเมื่อลูกความแจ้งว่าไม่จ้างต่อ หรือให้ปิด</p></div>
      <div className="flex flex-wrap gap-2"><div><Link href={`/cases/${caseId}?tab=tasks&newTask=1`} className={outlineBtn}><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" />เพิ่มงาน</Link><p className={`${hint} max-w-[11rem]`}>ลูกความติดต่อมา หรือมีเรื่องใหม่</p></div>{onCloseCase && <div><button type="button" onClick={onCloseCase} className={outlineBtn}><Archive aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ปิดคดี</button><p className={`${hint} max-w-[11rem]`}>ลูกความแจ้งว่าไม่จ้างต่อ หรือให้ปิด</p></div>}</div>
    </div>
    {idleDays != null && <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#d5e0ea] pt-4 text-sm"><span className="font-semibold">{idleDays === 0 ? 'มีความเคลื่อนไหวล่าสุดวันนี้' : `ไม่มีความเคลื่อนไหวมา ${idleDays} วัน`}</span><span className="text-muted-foreground">ถ้าลูกความเงียบไปนาน ลองโทรถามว่าจะให้ทำต่อหรือปิดคดี</span></div>}
    <UndoToast action={undo} onDismiss={() => setUndo(null)} />
  </section>;
  if (compact && task) return <section aria-label="เส้นทางคดี" className={`rounded-xl border-2 px-5 py-4 shadow-[0_6px_20px_rgba(20,46,67,.08)] ${overdue ? 'border-[#e9b9b9] bg-[#fbeaea]' : 'border-[#e6cf94] bg-[#fbf3e0]'}`}>
    <UndoToast action={undo} onDismiss={() => setUndo(null)} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className={`text-sm font-semibold ${overdue ? 'text-[#a83232]' : 'text-[#6b4f0b]'}`}>ต้องทำตอนนี้{journey.steps[current]?.label ? ` · ขั้น${journey.steps[current].label}` : ''}</p><p className="text-lg font-bold">{task.title} {task.dueDate && days !== null && <span className={`text-base font-semibold ${days < 0 ? 'text-[#a83232]' : 'text-muted-foreground'}`}>· {days < 0 ? `เลยกำหนดมา ${-days} วัน` : `ครบ ${date(task.dueDate)} · อีก ${days} วัน`}</span>}</p></div>
      <div className="flex gap-2"><Button onClick={() => onOpenTask(task.id)}>เปิดงานนี้ <ArrowRight aria-hidden="true" className="h-4 w-4" /></Button><Button variant="outline" disabled={busy} onClick={() => void completeTask(task.id, task.title, task.status, nextTask?.title)}><Check aria-hidden="true" className="h-4 w-4" />ทำเสร็จแล้ว</Button></div>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
  return <section className="space-y-4" aria-label="เส้นทางคดี">
    <UndoToast action={undo} onDismiss={() => setUndo(null)} />
    <NextActionCard eyebrow={journey.canAdvance && next ? 'ต้องทำตอนนี้' : `ต้องทำตอนนี้${journey.steps[current]?.label ? ` · ขั้น${journey.steps[current].label}` : ''}`} tone={overdue ? 'overdue' : journey.next?.kind === 'INFO' ? 'info' : journey.canAdvance ? 'ready' : 'default'} action={action} footer={journey.canAdvance && next ? undefined : <><span className="font-semibold">งานในขั้นนี้ เสร็จ {done}/{total}</span><span aria-hidden="true" className="flex w-40 gap-1">{[...journey.currentTasks].map((item) => item.status === 'DONE' || item.skippedReason ? 'bg-[#227052]' : item.dueDate && (daysUntil(item.dueDate) ?? 0) < 0 ? 'bg-[#a83232]' : 'bg-[#dedad0]').sort((a, b) => ['bg-[#227052]', 'bg-[#a83232]', 'bg-[#dedad0]'].indexOf(a) - ['bg-[#227052]', 'bg-[#a83232]', 'bg-[#dedad0]'].indexOf(b)).slice(0, 10).map((tone, index) => <i key={index} className={`h-2 flex-1 rounded-full ${tone}`} />)}</span>{nextTask && <span className="text-muted-foreground">งานถัดไป: {nextTask.title}{nextTask.dueDate && ` · ครบ ${date(nextTask.dueDate)}`}</span>}<Link className="ml-auto inline-flex min-h-11 items-center gap-1 font-semibold underline" href={`/cases/${caseId}?tab=tasks`}>ดูงานทั้งหมด ({taskCount ?? total}) <ArrowRight aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></Link></>} />
    {journey.canAdvance && <div className="flex flex-wrap gap-2">{journey.steps[current]?.key === 'AWAITING_JUDGMENT' && <Button variant="outline" onClick={() => onAdvance('APPEAL', 'APPEAL')}>อุทธรณ์</Button>}{journey.steps[current]?.key === 'APPEAL' && <Button variant="outline" onClick={() => onAdvance('SUPREME', 'SUPREME')}>ฎีกา</Button>}</div>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </section>;
}
