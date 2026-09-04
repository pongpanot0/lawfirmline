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
          onClick={() => onChange(BillingPeriod.MONTHLY)}
          className={cn(
            'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            value === BillingPeriod.MONTHLY
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground',
          )}
        >
          {d.billing.billingMonthly}
        </button>
        <button
          type="button"
          onClick={() => onChange(BillingPeriod.YEARLY)}
          className={cn(
            'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
            value === BillingPeriod.YEARLY
              ? 'bg-card text-foreground shadow-sm'
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
