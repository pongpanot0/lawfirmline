'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { CaseStage } from '@lawfirm/shared';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { FirmRoleStr, PlaybookDayBasis, PlaybookStep } from '@/lib/practice-setup';
import { caseStageLabel } from '@/lib/stage-labels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ROLE_LABELS: Record<FirmRoleStr, { th: string; en: string }> = {
  OWNER: { th: 'เจ้าของสำนักงาน', en: 'Firm owner' },
  SENIOR_LAWYER: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  LAWYER: { th: 'ทนาย', en: 'Lawyer' },
  ASSISTANT: { th: 'ผู้ช่วย', en: 'Assistant' },
};
const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as FirmRoleStr[];
const DAY_BASIS_LABELS: Record<PlaybookDayBasis, { th: string; en: string }> = {
  CALENDAR: { th: 'วันปฏิทิน', en: 'Calendar days' },
  BUSINESS: { th: 'วันทำการ', en: 'Business days' },
};

export function QuickFlowCanvas({ steps, setSteps, th, stepsError, titleErrors }: {
  steps: PlaybookStep[];
  setSteps: Dispatch<SetStateAction<PlaybookStep[]>>;
  th: boolean;
  stepsError?: string;
  titleErrors?: Record<number, string>;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newTitleError, setNewTitleError] = useState('');
  const [insertAfter, setInsertAfter] = useState<number | null>(null);
  const [insertTitle, setInsertTitle] = useState('');
  const [insertTitleError, setInsertTitleError] = useState('');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const stageLabel = (stage: CaseStage) => stage === CaseStage.INTAKE_REVIEW ? (th ? 'ตรวจรับเรื่อง' : 'Intake review') : caseStageLabel(stage, th ? 'th' : 'en');
  const editStep = (index: number, patch: Partial<PlaybookStep>) =>
    setSteps(rows => rows.map((step, i) => i === index ? { ...step, ...patch } : step));

  const addStep = (afterIndex: number, title: string, source: 'quick' | 'insert') => {
    if (steps.length >= 50) return;
    if (!title.trim()) {
      const message = th ? 'กรอกชื่องานก่อน' : 'Enter a task name.';
      if (source === 'quick') setNewTitleError(message);
      else setInsertTitleError(message);
      return;
    }
    const next = afterIndex + 1;
    // No hidden role, stage, or deadline: the backend gives an unconfigured task to the case lead when the SOP is applied.
    setSteps(rows => [...rows.slice(0, next), { title: title.trim(), instructions: '' }, ...rows.slice(next)]);
    setNewTitle('');
    setNewTitleError('');
    setInsertTitle('');
    setInsertTitleError('');
    setInsertAfter(null);
    setExpandedIndex(null);
  };

  const moveStep = (index: number, offset: number) => {
    const target = index + offset;
    if (target < 0 || target >= steps.length) return;
    setSteps(rows => {
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setExpandedIndex(target);
  };

  const removeStep = (index: number) => {
    if (!window.confirm(th ? `ลบขั้นตอน ${index + 1} ออกจากฉบับที่กำลังแก้ไข?` : `Remove step ${index + 1} from this draft?`)) return;
    setSteps(rows => rows.filter((_, i) => i !== index));
    setExpandedIndex(null);
  };

  return <section aria-label={th ? 'ผังลำดับงาน' : 'Workflow canvas'} className="mx-auto max-w-3xl overflow-hidden rounded-xl border bg-[#f6f8fc]">
    <div className="border-b bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{th ? 'ขั้นตอนใน SOP' : 'SOP steps'}</h2>
        <span className="text-xs text-muted-foreground">{steps.length} / 50</span>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); addStep(steps.length - 1, newTitle, 'quick'); }}>
        <Input aria-label={th ? 'ชื่องานใหม่' : 'New task name'} aria-invalid={!!newTitleError} aria-describedby={newTitleError ? 'new-step-title-error' : undefined} maxLength={200} value={newTitle} onChange={e => { setNewTitle(e.target.value); setNewTitleError(''); }} placeholder={th ? 'พิมพ์ชื่องาน แล้วกด Enter' : 'Type a task name, then press Enter'} className={`min-w-[180px] flex-1 ${newTitleError ? 'border-destructive' : ''}`} />
        <Button type="submit" disabled={steps.length >= 50}><Plus className="mr-1 h-4 w-4" />{th ? 'เพิ่มงาน' : 'Add task'}</Button>
      </form>
      {newTitleError && <p id="new-step-title-error" role="alert" className="mt-1 text-xs text-destructive">{newTitleError}</p>}
      {stepsError && !newTitleError && <p role="alert" className="mt-1 text-xs text-destructive">{stepsError}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{th ? 'ไม่ตั้งค่าเพิ่มเติม: งานจะสร้างเมื่อใช้ SOP และให้ทนายเจ้าของคดี' : 'Without extra settings, the task is created when the SOP is applied and assigned to the case lead.'}</p>
    </div>

    <div className="p-4 sm:p-6">
      {steps.length === 0 ? <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{th ? 'เริ่มด้วยชื่องานแรกด้านบน' : 'Add the first task above.'}</p> :
        <ol className="space-y-0">
          {steps.map((step, index) => <li key={index}>
            <div className="rounded-xl border bg-card p-3 shadow-sm sm:p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <Input id={`sop-step-title-${index}`} aria-label={th ? `ชื่องานขั้นตอน ${index + 1}` : `Step ${index + 1} task name`} aria-invalid={!!titleErrors?.[index]} aria-describedby={titleErrors?.[index] ? `sop-step-title-${index}-error` : undefined} required maxLength={200} value={step.title} onChange={e => editStep(index, { title: e.target.value })} className={`h-auto bg-transparent px-0 py-1 font-medium shadow-none focus-visible:ring-0 ${titleErrors?.[index] ? 'border-destructive' : 'border-0'}`} />
                  {titleErrors?.[index] && <p id={`sop-step-title-${index}-error`} role="alert" className="text-xs text-destructive">{titleErrors[index]}</p>}
                  {(step.stage || step.primaryRole || step.offsetDays != null) && <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {step.stage && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{stageLabel(step.stage)}</span>}
                    {step.primaryRole && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{ROLE_LABELS[step.primaryRole][th ? 'th' : 'en']}</span>}
                    {step.offsetDays != null && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">+{step.offsetDays} {DAY_BASIS_LABELS[step.dayBasis ?? 'CALENDAR'][th ? 'th' : 'en']}</span>}
                  </div>}
                </div>
                <button type="button" aria-expanded={expandedIndex === index} onClick={() => setExpandedIndex(expandedIndex === index ? null : index)} className="flex min-h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs text-primary hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{th ? 'รายละเอียด' : 'Details'}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedIndex === index ? 'rotate-180' : ''}`} /></button>
              </div>

              {expandedIndex === index && <div className="mt-4 space-y-4 border-t pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">{th ? 'สร้างงานเมื่อ' : 'Create task when'}
                    <select className="mt-1 h-9 w-full rounded-lg border bg-background px-2" value={step.stage ?? ''} onChange={e => editStep(index, { stage: (e.target.value || undefined) as PlaybookStep['stage'] })}>
                      <option value="">{th ? 'นำ SOP ไปใช้' : 'SOP is applied'}</option>
                      {Object.values(CaseStage).map(value => <option key={value} value={value}>{stageLabel(value)}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">{th ? 'ให้ใครทำ' : 'Assign to'}
                    <select className="mt-1 h-9 w-full rounded-lg border bg-background px-2" value={step.primaryRole ?? ''} onChange={e => editStep(index, { primaryRole: (e.target.value || undefined) as FirmRoleStr | undefined })}>
                      <option value="">{th ? 'ทนายเจ้าของคดี' : 'Case lead'}</option>
                      {ROLE_OPTIONS.map(role => <option key={role} value={role}>{ROLE_LABELS[role][th ? 'th' : 'en']}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-sm">{th ? 'วิธีทำ / ข้อควรระวัง (ถ้ามี)' : 'Instructions / cautions (optional)'}<textarea maxLength={5000} value={step.instructions} onChange={e => editStep(index, { instructions: e.target.value })} className="mt-1 min-h-24 w-full rounded-lg border bg-background p-2" /></label>
                <details className="rounded-lg border bg-muted/20 p-3"><summary className="cursor-pointer text-sm text-muted-foreground">{th ? 'กำหนดส่งและผู้ทำสำรอง' : 'Deadline and backup role'}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm">{th ? 'กำหนด + วัน' : 'Due after days'}<Input type="number" min={0} max={365} value={step.offsetDays ?? ''} onChange={e => editStep(index, { offsetDays: e.target.value === '' ? undefined : Math.max(0, Math.min(365, Number(e.target.value))) })} className="mt-1" /></label>
                    <label className="block text-sm">{th ? 'วิธีนับวัน' : 'Day basis'}<select className="mt-1 h-9 w-full rounded-lg border bg-background px-2" value={step.dayBasis ?? 'CALENDAR'} onChange={e => editStep(index, { dayBasis: e.target.value as PlaybookDayBasis })}>{(Object.keys(DAY_BASIS_LABELS) as PlaybookDayBasis[]).map(value => <option key={value} value={value}>{DAY_BASIS_LABELS[value][th ? 'th' : 'en']}</option>)}</select></label>
                    <label className="block text-sm">{th ? 'ผู้ทำสำรอง' : 'Backup role'}<select className="mt-1 h-9 w-full rounded-lg border bg-background px-2" value={step.secondaryRole ?? ''} onChange={e => editStep(index, { secondaryRole: (e.target.value || undefined) as FirmRoleStr | undefined })}><option value="">{th ? 'ไม่มี' : 'None'}</option>{ROLE_OPTIONS.map(role => <option key={role} value={role}>{ROLE_LABELS[role][th ? 'th' : 'en']}</option>)}</select></label>
                  </div>
                </details>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp className="mr-1 h-4 w-4" />{th ? 'เลื่อนขึ้น' : 'Move up'}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown className="mr-1 h-4 w-4" />{th ? 'เลื่อนลง' : 'Move down'}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(index)}><Trash2 className="mr-1 h-4 w-4 text-destructive" />{th ? 'ลบขั้นตอน' : 'Remove'}</Button>
                </div>
              </div>}
            </div>

            <div className="flex min-h-12 flex-col items-center justify-center">
              {insertAfter === index ? <form className="my-3 flex w-full flex-wrap gap-2 rounded-lg border bg-card p-2" onSubmit={e => { e.preventDefault(); addStep(index, insertTitle, 'insert'); }}>
                <Input autoFocus aria-label={th ? `ชื่องานที่แทรกหลังขั้นตอน ${index + 1}` : `Task after step ${index + 1}`} aria-invalid={!!insertTitleError} aria-describedby={insertTitleError ? 'insert-step-title-error' : undefined} maxLength={200} value={insertTitle} onChange={e => { setInsertTitle(e.target.value); setInsertTitleError(''); }} placeholder={th ? 'พิมพ์ชื่องาน แล้วกด Enter' : 'Type a task name, then press Enter'} className={`min-w-0 flex-1 ${insertTitleError ? 'border-destructive' : ''}`} />
                <Button type="submit" size="sm">{th ? 'เพิ่ม' : 'Add'}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setInsertAfter(null); setInsertTitle(''); setInsertTitleError(''); }}>{th ? 'ยกเลิก' : 'Cancel'}</Button>
                {insertTitleError && <p id="insert-step-title-error" role="alert" className="w-full text-xs text-destructive">{insertTitleError}</p>}
              </form> : <><span className="h-2 w-px bg-slate-300" aria-hidden="true" /><button type="button" disabled={steps.length >= 50} onClick={() => { setInsertAfter(index); setInsertTitle(''); setInsertTitleError(''); }} aria-label={th ? `เพิ่มงานหลังขั้นตอน ${index + 1}` : `Add task after step ${index + 1}`} className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-card text-slate-500 hover:border-primary hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40"><Plus className="h-4 w-4" /></button>{index < steps.length - 1 && <span className="h-2 w-px bg-slate-300" aria-hidden="true" />}</>}
            </div>
          </li>)}
        </ol>}
    </div>
  </section>;
}
