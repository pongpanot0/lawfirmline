'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { CaseStage } from '@lawfirm/shared';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { FirmRoleStr, PlaybookDayBasis, PlaybookStep } from '@/lib/practice-setup';
import { caseStageLabel } from '@/lib/stage-labels';
import { FIRM_ROLE_LABELS } from '@lawfirm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmDialog } from '@/lib/confirm-dialog';

const ROLE_LABELS: Record<FirmRoleStr, { th: string; en: string }> = {
  OWNER: { th: 'เจ้าของสำนักงาน', en: 'Firm owner' },
  SENIOR_LAWYER: { th: 'ทนายอาวุโส', en: 'Senior lawyer' },
  OFFICE_MANAGER: FIRM_ROLE_LABELS.OFFICE_MANAGER,
  LAWYER: { th: 'ทนาย', en: 'Lawyer' },
  ASSISTANT: { th: 'ผู้ช่วย', en: 'Assistant' },
  EXTERNAL: { th: 'ผู้รับงานภายนอก (ฟรีแลนซ์)', en: 'External (freelancer)' },
};
// The API accepts only these four step roles (OFFICE_MANAGER/EXTERNAL labels exist for display only).
const ROLE_OPTIONS: FirmRoleStr[] = ['OWNER', 'SENIOR_LAWYER', 'LAWYER', 'ASSISTANT'];
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
  const [adding, setAdding] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  useEffect(() => {
    const first = Object.keys(titleErrors ?? {})[0];
    if (first !== undefined) { setExpandedIndex(Number(first)); requestAnimationFrame(() => document.getElementById(`sop-step-title-${first}`)?.focus()); }
  }, [titleErrors]);
  const stageLabel = (stage: CaseStage) => stage === CaseStage.INTAKE_REVIEW ? (th ? 'ตรวจรับเรื่อง' : 'Intake review') : caseStageLabel(stage, th ? 'th' : 'en');
  const editStep = (index: number, patch: Partial<PlaybookStep>) =>
    setSteps(rows => rows.map((step, i) => i === index ? { ...step, ...patch } : step));

  const addStep = (afterIndex: number, title: string) => {
    if (steps.length >= 50) return;
    if (!title.trim()) {
      const message = th ? 'กรอกชื่องานก่อน' : 'Enter a task name.';
      setNewTitleError(message);
      return;
    }
    const next = afterIndex + 1;
    // No hidden role, stage, or deadline: the backend gives an unconfigured task to the case lead when the SOP is applied.
    setSteps(rows => [...rows.slice(0, next), { title: title.trim(), instructions: '' }, ...rows.slice(next)]);
    setNewTitle('');
    setNewTitleError('');
    setAdding(false);
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

  const removeStep = async (index: number) => {
    const title = steps[index]?.title.trim();
    if (!await confirmDialog(th ? `ลบขั้นตอน ${index + 1}${title ? ` "${title}"` : ''} ออกจากฉบับที่กำลังแก้ไข?` : `Remove step ${index + 1}${title ? ` "${title}"` : ''} from this draft?`)) return;
    setSteps(rows => rows.filter((_, i) => i !== index));
    setExpandedIndex(null);
  };

  return <section aria-label="ขั้นตอนงาน" className="rounded-xl border border-l-4 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-4 sm:p-5">
    <div className="mb-4 flex items-center gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-brass)] text-white">2</span><div><h2 className="font-semibold">ขั้นตอนงาน</h2><p className="text-sm text-muted-foreground">ลำดับงานที่ระบบจะสร้างให้ในคดี · {steps.length} / 50</p></div></div>
    {stepsError && <p role="alert" className="mb-2 text-xs text-destructive">{stepsError}</p>}
    {steps.length === 0 ? <p className="rounded-lg border border-dashed bg-card p-4 text-sm text-muted-foreground">ยังไม่มีขั้นตอน</p> :
      <ol className="space-y-2">
        {steps.map((step, index) => <li key={index} className={`rounded-md border bg-card ${!step.primaryRole || titleErrors?.[index] ? 'border-amber-400 bg-amber-50' : ''}`}>
          <div className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{index + 1}</span>
            <span className="min-w-0 flex-1 break-words font-medium">{step.title || 'ยังไม่ได้ตั้งชื่องาน'}</span>
            {step.primaryRole ? <span className="rounded bg-muted px-2 py-1 text-xs">ผู้ทำ: {ROLE_LABELS[step.primaryRole][th ? 'th' : 'en']}</span> : <span className="inline-flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-4 w-4" aria-hidden />ยังไม่มีผู้ทำ</span>}
            {step.offsetDays != null && <span className="rounded bg-muted px-2 py-1 text-xs">กำหนด +{step.offsetDays} {DAY_BASIS_LABELS[step.dayBasis ?? 'CALENDAR'][th ? 'th' : 'en']}</span>}
            <button type="button" aria-expanded={expandedIndex === index} onClick={() => setExpandedIndex(expandedIndex === index ? null : index)} className="min-h-11 px-2 text-sm font-medium text-primary hover:underline">แก้</button>
          </div>
              {expandedIndex === index && <div className="space-y-4 border-t p-4">
                <label className="block text-sm">ชื่องาน<Input id={`sop-step-title-${index}`} aria-label={`ชื่องานขั้นตอน ${index + 1}`} aria-invalid={!!titleErrors?.[index]} maxLength={200} value={step.title} onChange={e => editStep(index, { title: e.target.value })} /></label>{titleErrors?.[index] && <p role="alert" className="text-xs text-destructive">{titleErrors[index]}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">{th ? 'สร้างงานเมื่อ' : 'Create task when'}
                    <select className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={step.stage ?? ''} onChange={e => editStep(index, { stage: (e.target.value || undefined) as PlaybookStep['stage'] })}>
                      <option value="">{th ? 'นำชุดงานอัตโนมัติไปใช้' : 'SOP is applied'}</option>
                      {Object.values(CaseStage).map(value => <option key={value} value={value}>{stageLabel(value)}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">{th ? 'ให้ใครทำ' : 'Assign to'}
                    <select className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={step.primaryRole ?? ''} onChange={e => editStep(index, { primaryRole: (e.target.value || undefined) as FirmRoleStr | undefined })}>
                      <option value="">{th ? 'ทนายเจ้าของคดี' : 'Case lead'}</option>
                      {ROLE_OPTIONS.map(role => <option key={role} value={role}>{ROLE_LABELS[role][th ? 'th' : 'en']}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">{th ? 'ใช้เมื่อเราเป็นฝ่าย' : 'Only when we act for'}
                    <select className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={step.side ?? ''} onChange={e => editStep(index, { side: (e.target.value || undefined) as PlaybookStep['side'] })}>
                      <option value="">{th ? 'ทุกฝ่าย' : 'Either side'}</option>
                      <option value="PLAINTIFF">{th ? 'โจทก์ / ผู้ร้อง' : 'Plaintiff / petitioner'}</option>
                      <option value="DEFENDANT">{th ? 'จำเลย / ผู้คัดค้าน' : 'Defendant / respondent'}</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!step.requiresAttachment} onChange={e => editStep(index, { requiresAttachment: e.target.checked || undefined })} />
                    {th ? 'ต้องแนบไฟล์ก่อนส่งตรวจ' : 'Attachment required before review'}
                  </label>
                </div>
                <label className="block text-sm">{th ? 'วิธีทำ / ข้อควรระวัง (ถ้ามี)' : 'Instructions / cautions (optional)'}<textarea maxLength={5000} value={step.instructions} onChange={e => editStep(index, { instructions: e.target.value })} className="mt-1 min-h-24 w-full rounded-lg border bg-background p-2" /></label>
                <details className="rounded-lg border bg-muted/20 p-3" open={!!step.routine}>
                  <summary className="disclosure cursor-pointer text-sm">{th ? 'วิธีทำสำหรับงานประจำ' : 'Routine work requirements'}</summary>
                  <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!step.routine} onChange={e => editStep(index, { routine: e.target.checked ? { expectedOutput: '', checks: [], attachment: 'PDF' } : undefined })} />{th ? 'งานนี้ต้องมีผลงานและผ่านรายการตรวจก่อนส่ง' : 'Require results and checks before submission'}</label>
                  {step.routine && <div className="mt-3 space-y-3">
                    <label className="block text-sm">{th ? 'ผลที่ต้องส่ง' : 'Expected result'}<Input required maxLength={2000} value={step.routine.expectedOutput} onChange={e => editStep(index, { routine: { ...step.routine!, expectedOutput: e.target.value } })} /></label>
                    <label className="block text-sm">{th ? 'รายการตรวจ · ข้อละบรรทัด' : 'Checks · one per line'}<textarea required value={step.routine.checks.join('\n')} onChange={e => editStep(index, { routine: { ...step.routine!, checks: e.target.value.split('\n') } })} className="mt-1 min-h-24 w-full rounded-lg border p-2" /></label>
                    <label className="block text-sm">{th ? 'ไฟล์ผลงานที่ต้องแนบ' : 'Required attachment'}<select value={step.routine.attachment} onChange={e => editStep(index, { routine: { ...step.routine!, attachment: e.target.value as 'NONE' | 'ANY' | 'PDF' } })} className="mt-1 h-10 w-full rounded-lg border px-2"><option value="PDF">PDF</option><option value="ANY">{th ? 'ไฟล์ผลงาน' : 'Any result file'}</option><option value="NONE">{th ? 'ไม่บังคับไฟล์' : 'No attachment required'}</option></select></label>
                    <label className="block text-sm">{th ? 'ต้นฉบับที่ต้องใช้ในแฟ้มคดี (ถ้ามี)' : 'Source documents to use (optional)'}<Input maxLength={1000} value={step.routine.sourceHint ?? ''} onChange={e => editStep(index, { routine: { ...step.routine!, sourceHint: e.target.value } })} /></label>
                    <label className="block text-sm">{th ? 'ตัวอย่างชื่อไฟล์ (ถ้ามี)' : 'Example filename (optional)'}<Input maxLength={300} value={step.routine.exampleFilename ?? ''} onChange={e => editStep(index, { routine: { ...step.routine!, exampleFilename: e.target.value } })} /></label>
                    <details className="rounded-lg border p-3"><summary className="disclosure cursor-pointer text-sm">{th ? 'แบบบันทึก ตัวอย่างผลงาน และวิธีแก้เมื่อเอกสารขาด' : 'Source form, worked example and missing documents'}</summary><div className="mt-3 space-y-3">
                      <label className="block text-sm">{th ? 'แบบบันทึกต้นฉบับ · ใช้ข้อมูลจริงแทนช่องว่าง' : 'Source form · fill with actual data'}<textarea maxLength={4000} value={step.routine.sourceTemplate ?? ''} onChange={e => editStep(index, { routine: { ...step.routine!, sourceTemplate: e.target.value } })} className="mt-1 min-h-32 w-full rounded-lg border p-2" /></label>
                      <label className="block text-sm">{th ? 'ตัวอย่างผลงานที่ครบ · ระบุว่าเป็นข้อมูลสมมติ' : 'Complete worked example · mark sample data'}<textarea maxLength={6000} value={step.routine.exampleOutput ?? ''} onChange={e => editStep(index, { routine: { ...step.routine!, exampleOutput: e.target.value } })} className="mt-1 min-h-32 w-full rounded-lg border p-2" /></label>
                      <label className="block text-sm">{th ? 'เมื่อเอกสารขาดหรือข้อมูลไม่ตรง ให้ทำอย่างไร' : 'What to do when documents are missing or inconsistent'}<textarea maxLength={2000} value={step.routine.missingDocuments ?? ''} onChange={e => editStep(index, { routine: { ...step.routine!, missingDocuments: e.target.value } })} className="mt-1 min-h-24 w-full rounded-lg border p-2" /></label>
                    </div></details>
                    <p className="text-xs text-muted-foreground">{th ? 'คนทำจะเห็นวิธีทำ ผลที่ต้องส่ง และรายการตรวจในงานนั้น · งานที่สร้างไปแล้วใช้ฉบับเดิม · ผู้ตรวจต้องเป็นคนอื่น' : 'Workers see these instructions and requirements in the task. Existing tasks keep their assigned version; another person must review.'}</p>
                  </div>}
                </details>
                <details className="rounded-lg border bg-muted/20 p-3"><summary className="disclosure cursor-pointer text-sm text-muted-foreground">{th ? 'กำหนดส่งและผู้ทำสำรอง' : 'Deadline and backup role'}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="block text-sm">{th ? 'ครบกำหนดใน (วัน)' : 'Due after days'}<Input type="number" min={0} max={365} value={step.offsetDays ?? ''} onChange={e => editStep(index, { offsetDays: e.target.value === '' ? undefined : Math.max(0, Math.min(365, Number(e.target.value))) })} className="mt-1" /></label>
                    <label className="block text-sm">{th ? 'วิธีนับวัน' : 'Day basis'}<select className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={step.dayBasis ?? 'CALENDAR'} onChange={e => editStep(index, { dayBasis: e.target.value as PlaybookDayBasis })}>{(Object.keys(DAY_BASIS_LABELS) as PlaybookDayBasis[]).map(value => <option key={value} value={value}>{DAY_BASIS_LABELS[value][th ? 'th' : 'en']}</option>)}</select></label>
                    <label className="block text-sm">{th ? 'ผู้ทำสำรอง' : 'Backup role'}<select className="mt-1 h-10 w-full rounded-lg border bg-background px-2" value={step.secondaryRole ?? ''} onChange={e => editStep(index, { secondaryRole: (e.target.value || undefined) as FirmRoleStr | undefined })}><option value="">{th ? 'ไม่มี' : 'None'}</option>{ROLE_OPTIONS.map(role => <option key={role} value={role}>{ROLE_LABELS[role][th ? 'th' : 'en']}</option>)}</select></label>
                  </div>
                </details>
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => moveStep(index, -1)}><ArrowUp className="h-4 w-4" aria-hidden />{th ? 'เลื่อนขึ้น' : 'Move up'}</Button>
                  <Button type="button" size="sm" variant="outline" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)}><ArrowDown className="h-4 w-4" aria-hidden />{th ? 'เลื่อนลง' : 'Move down'}</Button>
                  <Button type="button" size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeStep(index)}><Trash2 className="h-4 w-4" aria-hidden />{th ? 'ลบขั้นตอน' : 'Remove'}</Button>
                </div>
              </div>}
          </li>)}
      </ol>}
    <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t pt-4">
      <div>{adding ? <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); addStep(steps.length - 1, newTitle); }}><Input autoFocus aria-label="ชื่องานใหม่" aria-invalid={!!newTitleError} maxLength={200} value={newTitle} onChange={e => { setNewTitle(e.target.value); setNewTitleError(''); }} placeholder="พิมพ์ชื่องาน" className="min-w-0 flex-1" /><Button type="submit">เพิ่ม</Button><Button type="button" variant="ghost" onClick={() => setAdding(false)}>ยกเลิก</Button></form> : <Button type="button" variant="outline" disabled={steps.length >= 50} onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden />เพิ่มขั้นตอน</Button>}{newTitleError && <p role="alert" className="text-xs text-destructive">{newTitleError}</p>}<p className="mt-1 text-xs text-muted-foreground">เพิ่มงานที่ระบบจะสร้างให้ในคดี</p></div>
      <p className="text-xs text-muted-foreground">เปิดแก้ไขเพื่อเลื่อนลำดับงานขึ้นหรือลง</p>
    </div>
  </section>;
}
