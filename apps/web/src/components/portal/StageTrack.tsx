import { caseStageIndex } from '@lawfirm/shared';
import { caseStageLabel } from '@/lib/stage-labels';
import { cn } from '@/lib/utils';

export function StageTrack({ stage, status, className }: { stage?: string; status: string; className?: string }) {
  if (!stage) return null;
  const index = caseStageIndex(stage);
  const step = Math.min(8, Math.max(1, index + 1));
  return <div className={cn('flex flex-wrap items-center gap-3 text-sm text-muted-foreground', className)}>
    <span aria-hidden className="flex w-36 gap-1">{Array.from({ length: 8 }, (_, i) => <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < step ? 'bg-primary' : 'bg-muted')} />)}</span>
    <span>ขั้น {step} จาก 8 · {caseStageLabel(stage, 'th')}</span>
  </div>;
}
