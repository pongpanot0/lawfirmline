'use client';
import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { stepPosition, type ProcessStep } from './helpers';

export function StepTracker({ steps, variant = 'full' }: { steps: ProcessStep[]; variant?: 'full' | 'mini' }) {
  const { current, position } = stepPosition(steps);
  const currentRef = useRef<HTMLLIElement>(null);
  useEffect(() => { if (variant === 'full') currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [current, variant]);
  if (variant === 'mini') return <div aria-label={`ขั้น ${position} จาก ${steps.length}`} className="min-w-0"><div className="flex gap-1">{steps.map((step) => <span key={step.key} className={`h-1.5 flex-1 rounded-full ${step.state === 'todo' ? 'bg-muted' : 'bg-primary'}`} />)}</div><p className="mt-1 text-xs text-muted-foreground">{steps[current]?.label ?? steps.at(-1)?.label} · {position}/{steps.length}</p></div>;
  return <div className="min-w-0 overflow-x-auto"><ol className="flex min-w-full w-max gap-1">{steps.map((step) => <li key={step.key} ref={step.state === 'current' ? currentRef : undefined} aria-current={step.state === 'current' ? 'step' : undefined} className="min-w-32 flex-1 text-sm"><span aria-hidden="true" className={`mb-2 block h-2 rounded-full ${step.state === 'done' ? 'bg-success' : step.state === 'current' ? 'bg-primary' : 'bg-muted'}`} /><span className={`flex items-center gap-1 ${step.state === 'current' ? 'font-bold' : step.state === 'todo' ? 'text-muted-foreground' : ''}`}>{step.state === 'done' && <Check aria-hidden="true" className="h-4 w-4 text-success" />}{step.label}</span>{step.state === 'current' && <span className="text-xs text-muted-foreground">ขั้นปัจจุบัน</span>}</li>)}</ol></div>;
}
