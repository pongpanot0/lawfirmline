export type ProcessStep = { key: string; label: string; state: 'done' | 'current' | 'todo' };

export function stepPosition(steps: ProcessStep[]) {
  const current = steps.findIndex((step) => step.state === 'current');
  return { current, position: current < 0 ? steps.length : current + 1 };
}

export function dueLabel(date: string, now = new Date()): { text: string; urgent: boolean } | null {
  const due = new Date(date);
  if (Number.isNaN(due.getTime())) return null;
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = Math.round((day(due) - day(now)) / 86400000);
  return { text: days < 0 ? `เลยกำหนด ${-days} วัน` : days === 0 ? 'ครบวันนี้' : `เหลือ ${days} วัน`, urgent: days <= 7 };
}

export function daysUntil(date: string, now = new Date()): number | null {
  const due = new Date(date);
  if (Number.isNaN(due.getTime())) return null;
  const day = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((day(due) - day(now)) / 86400000);
}
