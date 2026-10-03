'use client';

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setSteps(template?.steps.length ? template.steps.map((s) => ({ ...s })) : [blankStep()]);
    setError('');
  }, [open, template]);

  const save = async () => {
    const problem = !name.trim() ? 'ตั้งชื่อแม่แบบก่อน' : stepsProblem(steps);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const data = { name: name.trim(), description: description.trim() || undefined, steps: cleanSteps(steps) };
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
    <SideDrawer open={open} title={template ? 'แก้แม่แบบสายงาน' : 'สร้างแม่แบบสายงาน'} onClose={onClose}>
      <div className="space-y-4">
        <TextField label="ชื่อแม่แบบ" placeholder="เช่น แปล → ใบเบิกความ → คำฟ้อง" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextareaField label="อธิบาย (ไม่บังคับ)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div>
          <p className="mb-2 text-sm font-medium">ขั้นตอน (ทำตามลำดับ ขั้นถัดไปเริ่มเมื่อขั้นก่อนเสร็จ)</p>
          <StepsEditor steps={steps} onChange={setSteps} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
        </div>
      </div>
    </SideDrawer>
  );
}
