import { cn } from '@/lib/utils';

type SamnuanLogoProps = {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
  variant?: 'icon' | 'horizontal';
};

export function SamnuanLogo({
  className,
  markClassName,
  wordmark = true,
  variant = 'icon',
}: SamnuanLogoProps) {
  if (variant === 'horizontal') {
    return (
      <img
        src="/brand/samnuan-logo.png"
        alt="Samnuan"
        className={cn('h-10 w-auto object-contain', className)}
      />
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <img
        src="/brand/samnuan-icon.png"
        alt=""
        aria-hidden="true"
        className={cn('h-9 w-9 rounded-lg object-contain', markClassName)}
      />
      {wordmark && <span className="font-bold tracking-tight">Samnuan</span>}
    </span>
  );
}
