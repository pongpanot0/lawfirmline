'use client';

import { BillingPeriod } from '@lawfirm/shared';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { cn } from '@/lib/utils';

export function BillingPeriodToggle({
  value,
  onChange,
  className,
}: {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  className?: string;
}) {
  const d = useDashboardT();
  return (
    <div className={cn('flex justify-center', className)}>
      <div className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1">
        <button
          type="button"
          aria-pressed={value === BillingPeriod.MONTHLY}
          onClick={() => onChange(BillingPeriod.MONTHLY)}
          className={cn(
            'min-h-10 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === BillingPeriod.MONTHLY
              ? 'bg-card text-foreground ring-1 ring-border'
              : 'text-muted-foreground',
          )}
        >
          {d.billing.billingMonthly}
        </button>
        <button
          type="button"
          aria-pressed={value === BillingPeriod.YEARLY}
          onClick={() => onChange(BillingPeriod.YEARLY)}
          className={cn(
            'flex min-h-10 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === BillingPeriod.YEARLY
              ? 'bg-card text-foreground ring-1 ring-border'
              : 'text-muted-foreground',
          )}
        >
          {d.billing.billingYearly}
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            {d.billing.yearlySave}
          </span>
        </button>
      </div>
    </div>
  );
}
