import { stepPosition, type ProcessStep } from './helpers';
export function StepTracker({ steps, variant = 'full' }: { steps: ProcessStep[]; variant?: 'full' | 'mini' }) {
  const { current, position } = stepPosition(steps);
  if (variant === 'mini') return <div aria-label={`ขั้น ${position} จาก ${steps.length}`} className="min-w-0"><div className="flex gap-1">{steps.map((step) => <span key={step.key} className={`h-1.5 flex-1 rounded-full ${step.state === 'todo' ? 'bg-muted' : 'bg-primary'}`} />)}</div><p className="mt-1 text-xs text-muted-foreground">{steps[current]?.label ?? steps.at(-1)?.label} · {position}/{steps.length}</p></div>;
  return <ol className="flex overflow-x-auto">{steps.map((step) => <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="flex min-w-32 items-center gap-2 text-sm"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${step.state === 'done' ? 'bg-primary text-primary-foreground' : step.state === 'current' ? 'border-primary ring-2 ring-primary/30' : 'bg-muted'}`}>{step.state === 'done' ? '✓' : '•'}</span>{step.label}</li>)}</ol>;
}
