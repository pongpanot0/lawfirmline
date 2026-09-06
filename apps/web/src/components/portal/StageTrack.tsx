import { cn } from '@/lib/utils';
import { getCaseStageIndex, CASE_STAGE_COUNT } from '@/lib/case-status';

export function StageTrack({ status, className }: { status: string; className?: string }) {
  const current = getCaseStageIndex(status);
  const segments = Array.from({ length: CASE_STAGE_COUNT });

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {segments.map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-1 flex-1 rounded-full bg-accent',
            i < current && 'bg-primary',
            i === current && 'bg-primary/40',
          )}
        />
      ))}
    </div>
  );
}
