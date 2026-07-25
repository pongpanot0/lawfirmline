'use client';

import Link from 'next/link';
import { SubscriptionStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export function TrialBanner() {
  const { user } = useAuth();
  const d = useDashboardT();
  if (!user || user.subscriptionStatus !== SubscriptionStatus.TRIAL) return null;

  const days = user.trialEndAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndAt).getTime() - Date.now()) / 86400000))
    : 0;

  const urgent = days <= 7;

  return (
    <div
      className={cn(
        'border-b px-4 py-2 text-center text-sm',
        urgent ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-primary/20 bg-primary/5 text-primary',
      )}
    >
      {days > 0 ? (
        <>
          {fmt(d.trial.daysRemaining, { days })}{' '}
          <Link href="/account/billing" className="font-medium underline">
            {d.trial.subscribeNow}
          </Link>
        </>
      ) : (
        <>
          {d.trial.ended} —{' '}
          <Link href="/account/billing" className="font-medium underline">
            {d.trial.choosePlan}
          </Link>
        </>
      )}
    </div>
  );
}
