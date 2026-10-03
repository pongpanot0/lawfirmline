'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, type WorkflowAssignee, type WorkflowRole, type WorkflowStepDef, type WorkflowTemplate } from '@/lib/api';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { StepsEditor } from './StepsEditor';
import { ROLE_LABELS, blankStep, cleanSteps, stepsProblem } from './workflow-ui';

/**
 * Start a handoff chain on a case: pick a template (or write steps), then a
 * person per step — prefilled with whoever in that role has the fewest open tasks.
 */
export function StartWorkflowDrawer({
  open, token, caseId, onClose, onStarted,
}: {
  open: boolean;
  token: string;
  caseId: string;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [customSteps, setCustomSteps] = useState<WorkflowStepDef[]>([blankStep()]);
  const [name, setName] = useState('');
  const [promisedAt, setPromisedAt] = useState('');
  const [people, setPeople] = useState<Partial<Record<WorkflowRole, WorkflowAssignee[]>>>({});
  const [assignees, setAssignees] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(''); setName(''); setPromisedAt(''); setTemplateId(''); setCustomSteps([blankStep()]);
    api.getWorkflowTemplates(token).then((items) => {
      setTemplates(items);
      if (items[0]) { setTemplateId(items[0].id); setName(items[0].name); }
    }).catch((e) => setError(e.message));
  }, [open, token]);

  const steps = useMemo(
    () => (templateId ? templates.find((t) => t.id === templateId)?.steps ?? [] : customSteps),
    [templateId, templates, customSteps],
  );
  const roles = useMemo(() => [...new Set(steps.map((s) => s.role))], [steps]);

  // Load candidates for every role the steps need, lightest first.
  useEffect(() => {
    if (!open) return;
    const missing = roles.filter((role) => !people[role]);
    if (!missing.length) return;
    Promise.all(missing.map((role) => api.getWorkflowAssignees(token, role).then((list) => [role, list] as const)))
      .then((pairs) => setPeople((prev) => ({ ...prev, ...Object.fromEntries(pairs) })))
      .catch((e) => setError(e.message));
  }, [open, token, roles, people]);

  // Default each step to the lightest candidate of its role.
  useEffect(() => {
    setAssignees(steps.map((step, i) => {
      const options = people[step.role] ?? [];
      return options.some((p) => p.userId === assignees[i]) ? assignees[i] : options[0]?.userId ?? '';
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, people]);

  const start = async () => {
    const problem = !name.trim() ? 'ตั้งชื่อสายงานก่อน' : templateId ? null : stepsProblem(customSteps);
    if (problem) return setError(problem);
    const unstaffed = steps.findIndex((_, i) => !assignees[i]);
    if (unstaffed >= 0) return setError(`ขั้นที่ ${unstaffed + 1}: ไม่มีคนในบทบาท ${ROLE_LABELS[steps[unstaffed].role]} — เชิญเข้าทีมก่อน`);
    setBusy(true);
    try {
      await api.createWorkflowRun(token, caseId, {
        ...(templateId ? { templateId } : { steps: cleanSteps(customSteps) }),
        name: name.trim(),
        promisedAt: promisedAt || undefined,
        assignees,
      });
      onStarted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เริ่มสายงานไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SideDrawer open={open} title="เริ่มสายงาน" onClose={onClose}>
      <div className="space-y-4">
        <SelectField label="แม่แบบ" value={templateId} onChange={(e) => {
          setTemplateId(e.target.value);
          const t = templates.find((x) => x.id === e.target.value);
          if (t) setName(t.name);
        }}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.steps.length} ขั้น)</option>)}
          <option value="">— กำหนดขั้นเอง —</option>
        </SelectField>
        <TextField label="ชื่อสายงาน" placeholder="เช่น คำให้การพยาน นาย ก." value={name} onChange={(e) => setName(e.target.value)} required />
        <div>
          <label className="mb-1 block text-sm font-medium">วันที่สัญญากับลูกความ (ไม่บังคับ)</label>
          <ThaiDateInput value={promisedAt} onChange={setPromisedAt} />
          <p className="mt-1 text-xs text-muted-foreground">ระบบจะเตือนในหน้าสายงานถ้าคาดว่าจะเสร็จช้ากว่าวันนี้</p>
        </div>

        {!templateId && <StepsEditor steps={customSteps} onChange={setCustomSteps} />}

        <div>
          <p className="mb-2 text-sm font-medium">ผู้รับแต่ละขั้น <span className="font-normal text-muted-foreground">(เลือกคนที่งานน้อยที่สุดให้แล้ว)</span></p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                <span className="font-medium">{i + 1}. {step.title || '(ยังไม่ตั้งชื่อ)'}</span>
                <span className="text-xs text-muted-foreground">· {step.durationDays} วันทำการ</span>
                <select
                  aria-label={`ผู้รับขั้นที่ ${i + 1}`}
                  className="ml-auto h-8 min-w-[12rem] rounded-md border border-input bg-card px-2"
                  value={assignees[i] ?? ''}
                  onChange={(e) => setAssignees((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                >
                  {(people[step.role] ?? []).length === 0 && <option value="">ไม่มี{ROLE_LABELS[step.role]}ในทีม</option>}
                  {(people[step.role] ?? []).map((p) => (
                    <option key={p.userId} value={p.userId}>{p.name} · งานค้าง {p.openTaskCount}</option>
                  ))}
                </select>
              </li>
            ))}
          </ol>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={start} disabled={busy || !steps.length}>{busy ? 'กำลังเริ่ม…' : 'เริ่มสายงาน'}</Button>
        </div>
      </div>
    </SideDrawer>
  );
}
