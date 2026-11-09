import { Check, Lock } from 'lucide-react';
import type { EmailIntakeStep } from '@/lib/api';

export function Stepper({ steps }: { steps: EmailIntakeStep[] }) {
  return <ol className="my-4 grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-5">
    {steps.map((step, index) => <li key={step.key} className="flex min-w-0 items-center gap-2">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${step.state === 'done' ? 'bg-success text-success-foreground' : step.state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        {step.state === 'done' ? <Check className="h-4 w-4" /> : step.state === 'locked' ? <Lock className="h-4 w-4" /> : index + 1}
      </span>
      <span className="min-w-0 text-sm"><span className="flex flex-wrap items-center gap-1 text-xs leading-5 text-muted-foreground">ขั้นตอนที่ {index + 1} {step.state === 'current' && <span className="rounded-full bg-primary px-2 text-[11px] leading-5 text-primary-foreground">กำลังทำ</span>}</span><span className={`block break-words font-medium ${step.state === 'locked' ? 'text-muted-foreground' : ''}`}>{step.label}</span></span>
    </li>)}
  </ol>;
}
