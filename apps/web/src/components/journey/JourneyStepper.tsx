import { Check, Lock } from 'lucide-react';
import type { JourneyStep } from '@/lib/api';

export function JourneyStepper({ steps }: { steps: JourneyStep[] }) {
  return <div className="my-4 max-w-full overflow-x-auto rounded-lg border bg-card p-4"><ol className="flex flex-col gap-3 lg:w-max lg:min-w-full lg:flex-row">
    {steps.map((step, index) => <li key={step.key} className="flex min-w-0 items-center gap-2 lg:w-40 lg:shrink-0">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${step.state === 'done' ? 'bg-success text-success-foreground' : step.state === 'current' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
        {step.state === 'done' ? <Check className="h-4 w-4" /> : step.state === 'locked' ? <Lock className="h-4 w-4" /> : index + 1}
      </span>
      <span className="min-w-0 text-sm"><span className="block text-xs text-muted-foreground">ขั้นตอนที่ {index + 1} {step.state === 'current' && '· กำลังทำ'}</span><span className={`block font-medium ${step.state === 'locked' ? 'text-muted-foreground' : ''}`}>{step.label}</span>{(step.summary || step.unlockHint) && <span className="block text-xs text-muted-foreground">{step.summary || step.unlockHint}</span>}</span>
    </li>)}
  </ol></div>;
}
