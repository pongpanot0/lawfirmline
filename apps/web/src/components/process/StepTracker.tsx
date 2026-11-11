'use client';
import { Check } from 'lucide-react';
import { stepPosition, type ProcessStep } from './helpers';

export function StepTracker({ steps, variant = 'full' }: { steps: ProcessStep[]; variant?: 'full' | 'mini' }) {
  const { current, position } = stepPosition(steps);
  if (variant === 'mini') return <div aria-label={`ขั้น ${position} จาก ${steps.length}`} className="min-w-0"><div className="flex gap-1">{steps.map((step) => <span key={step.key} className={`h-1.5 flex-1 rounded-full ${step.state === 'todo' ? 'bg-muted' : 'bg-primary'}`} />)}</div><p className="mt-1 text-xs text-muted-foreground">{steps[current]?.label ?? steps.at(-1)?.label} · {position}/{steps.length}</p></div>;
  return <div className="min-w-0"><ol className="mt-2 grid grid-cols-8 gap-1 pb-5 text-center text-xs">{steps.map((step) => <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="min-w-0"><span aria-hidden="true" className={`block h-2 ${step.state === 'done' ? 'bg-success' : step.state === 'current' ? 'bg-primary' : 'bg-[#dedad0]'}`} /><span className={`mt-2 block ${step.state === 'current' ? 'font-bold' : step.state === 'todo' ? 'text-muted-foreground' : ''}`}>{step.state === 'done' && <Check aria-hidden="true" className="inline h-[1.1em] w-[1.1em] text-success" />}{step.label}</span>{step.state === 'current' && <span className="text-xs text-[#8b6d32]">ขั้นปัจจุบัน</span>}</li>)}</ol></div>;
}
