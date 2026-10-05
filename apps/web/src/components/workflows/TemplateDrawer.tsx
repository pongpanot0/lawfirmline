'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type WorkflowStepDef, type WorkflowTemplate } from '@/lib/api';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';
import { TextField, TextareaField } from '@/components/ui/form-fields';
import { StepsEditor } from './StepsEditor';
import { blankStep, cleanSteps, stepsProblem } from './workflow-ui';

/** Create or edit a workflow template (OWNER / SENIOR_LAWYER). */
export function TemplateDrawer({
  open, token, template, onClose, onSaved,
}: {
  open: boolean;
  token: string;
  template: WorkflowTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStepDef[]>([blankStep()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setSteps(template?.steps.length ? template.steps.map((s) => ({ ...s })) : [blankStep()]);
    setError('');
  }, [open, template]);

  const save = async () => {
    if (busy) return;
    const problem = !name.trim() ? 'ตั้งชื่อแม่แบบก่อน' : stepsProblem(steps);
    if (problem) return setError(problem);
    setError('');
    setBusy(true);
    try {
      const data = { name: name.trim(), description: description.trim() || (template ? '' : undefined), steps: cleanSteps(steps) };
      if (template) await api.updateWorkflowTemplate(token, template.id, data);
      else await api.createWorkflowTemplate(token, data);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideDrawer open={open} title={template ? 'แก้ Handoff flow' : 'สร้าง Handoff flow'} onClose={close}>
      <form noValidate aria-label="แม่แบบสายงานส่งต่อ" onSubmit={e => { e.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">บันทึกเป็นแม่แบบใช้ซ้ำ แล้วเลือกผู้รับจริงเมื่อเริ่มสายงานในคดี</p>
        <TextField label="ชื่อแม่แบบ" placeholder="เช่น รับเรื่อง → ตรวจหลักฐาน → วางแนวทางคดี" value={name} onChange={(e) => setName(e.target.value)} required />
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm">คำอธิบาย (ไม่บังคับ){description.trim() && ' · มีข้อมูลแล้ว'}</summary>
          <TextareaField className="mt-3" label="อธิบาย (ไม่บังคับ)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </details>
        {!template && !name && steps.length === 1 && !steps[0].title && <Button type="button" variant="outline" size="sm" onClick={() => {
          setName('รับเรื่องและวางแนวทางคดี');
          setSteps([
            { title: 'รวบรวมข้อมูลและเอกสาร', role: 'ASSISTANT', durationDays: 1, instructions: 'ตรวจข้อมูลลูกความและแนบเอกสารที่ได้รับ', requiresReview: false },
            { title: 'ตรวจหลักฐานและสรุปประเด็น', role: 'LAWYER', durationDays: 2, instructions: 'สรุปข้อเท็จจริงและประเด็นที่ต้องขอข้อมูลเพิ่ม', requiresReview: true },
            { title: 'ตรวจแนวทางก่อนแจ้งลูกความ', role: 'SENIOR_LAWYER', durationDays: 1, instructions: 'ตรวจข้อเสนอและแนวทางดำเนินคดี', requiresReview: false },
          ]);
        }}>ใช้ตัวอย่างรับเรื่อง</Button>}
        <div>
          <p className="mb-2 text-sm font-semibold">ลำดับส่งต่องาน · {steps.length} ขั้น</p>
          <StepsEditor steps={steps} onChange={setSteps} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="sticky -bottom-4 -mx-4 flex justify-end gap-2 border-t bg-card px-4 py-3">
          <Button type="button" variant="outline" onClick={close}>ยกเลิก</Button>
          <Button type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
        </div>
      </fieldset>
      </form>
    </SideDrawer>
  );
}
