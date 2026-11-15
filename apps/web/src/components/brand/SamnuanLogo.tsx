import { cn } from '@/lib/utils';

type SamnuanLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  wordmark?: boolean;
  variant?: 'icon' | 'horizontal';
};

export function SamnuanLogo({
  className,
  markClassName,
  wordmarkClassName,
  wordmark = true,
  variant = 'icon',
}: SamnuanLogoProps) {
  return (
    <span
      role="img"
      aria-label="Samnuan"
      className={cn('inline-flex shrink-0 items-center gap-2.5', className)}
    >
      <img
        src={variant === 'horizontal' ? '/brand/samnuan-balance-mark-72.png' : '/brand/samnuan-balance-icon.png'}
        alt=""
        aria-hidden="true"
        width={variant === 'horizontal' ? 72 : 256}
        height={variant === 'horizontal' ? 72 : 256}
        className={cn('h-9 w-9 shrink-0 object-contain', markClassName)}
      />
      {wordmark && (
        <span
          aria-hidden="true"
          className={cn('whitespace-nowrap text-[1em] font-normal leading-none tracking-[0.14em]', wordmarkClassName)}
          style={{ fontFamily: 'var(--font-display)' }}
        >
          SAMNUAN
        </span>
      )}
    </span>
  );
}
