import { cn } from '@/lib/utils';
import { getCaseStageIndex, CASE_STAGE_COUNT } from '@/lib/case-status';

/**
 * แถบความคืบหน้าของคดีที่ลูกความเห็น
 *
 * อ่านจาก `stage` (ขั้นตอนในกระบวนพิจารณา) — `status` เป็น fallback สำหรับ
 * payload เก่าที่ยังไม่ส่ง stage มา
 */
export function StageTrack({
  stage,
  status,
  className,
}: {
  stage?: string;
  status: string;
  className?: string;
}) {
  const current = getCaseStageIndex(stage ?? status);
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
