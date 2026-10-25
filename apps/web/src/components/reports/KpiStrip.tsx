import Link from 'next/link';
import { cn } from '@/lib/utils';

export type KpiItem = { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; tone?: 'default' | 'destructive' | 'success' };

const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
};

/** One container split by dividers: label over value, no icon tiles. */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-lg border bg-border', COLS[items.length] ?? 'sm:grid-cols-3', className)}>
      {items.map((item) => {
        const body = (
          <>
            <p className="text-xs text-muted-foreground sm:text-sm">{item.label}</p>
            <p className={cn(
              'mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl',
              item.tone === 'destructive' && 'text-destructive',
              item.tone === 'success' && 'text-success',
            )}>{item.value}</p>
            {item.note && <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{item.note}</p>}
          </>
        );
        const cell = 'min-w-0 bg-card p-4';
        return item.href ? (
          <Link key={item.label} href={item.href} className={cn(cell, 'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring')}>{body}</Link>
        ) : (
          <div key={item.label} className={cell}>{body}</div>
        );
      })}
    </div>
  );
}
