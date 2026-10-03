import type { WorkflowRole, WorkflowStepDef } from '@/lib/api';

export const ROLE_LABELS: Record<WorkflowRole, string> = {
  OWNER: 'เจ้าของสำนักงาน',
  SENIOR_LAWYER: 'ทนายอาวุโส',
  LAWYER: 'ทนาย',
  ASSISTANT: 'ผู้ช่วย',
  EXTERNAL: 'ผู้รับงานภายนอก (ฟรีแลนซ์)',
};

export const ROLE_ORDER: WorkflowRole[] = ['EXTERNAL', 'ASSISTANT', 'LAWYER', 'SENIOR_LAWYER', 'OWNER'];

export const blankStep = (): WorkflowStepDef => ({ title: '', role: 'LAWYER', durationDays: 1, instructions: '', requiresReview: false });

/** "3 ต.ค." — short Thai day + month, Bangkok wall clock. */
export function shortThaiDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
}

/** First problem with a list of steps, in the words the form shows; null when it can be saved. */
export function stepsProblem(steps: WorkflowStepDef[]): string | null {
  if (!steps.length) return 'เพิ่มอย่างน้อย 1 ขั้น';
  for (const [i, step] of steps.entries()) {
    if (!step.title.trim()) return `ขั้นที่ ${i + 1} ยังไม่มีชื่อ`;
    if (!Number.isInteger(step.durationDays) || step.durationDays < 1 || step.durationDays > 60) return `ขั้นที่ ${i + 1}: ระยะเวลา 1–60 วันทำการ`;
  }
  return null;
}

/** Strip empty instructions so the API stores clean steps. */
export const cleanSteps = (steps: WorkflowStepDef[]): WorkflowStepDef[] =>
  steps.map((s) => ({ ...s, title: s.title.trim(), instructions: s.instructions?.trim() || undefined }));

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
