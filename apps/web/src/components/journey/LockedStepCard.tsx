import { Lock } from 'lucide-react';
import type { JourneyStep } from '@/lib/api';
export function LockedStepCard({ step }: { step: JourneyStep }) {
  return <div className="flex gap-3 rounded-lg border border-dashed bg-muted/50 p-4 text-muted-foreground"><Lock className="h-4 w-4 shrink-0" aria-hidden /><div><p className="font-medium">{step.label}</p>{step.unlockHint && <p className="text-sm">{step.unlockHint}</p>}</div></div>;
}
