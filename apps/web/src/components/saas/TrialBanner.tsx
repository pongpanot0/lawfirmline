'use client';

import Link from 'next/link';
import { FirmRole, SubscriptionStatus, subscriptionAllowsWrites } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

/** Trial countdown, or the read-only notice once the firm's trial/plan has lapsed (the API 402s writes then). */
export function TrialBanner() {
  const { user } = useAuth();
  const d = useDashboardT();
  if (!user) return null;
  const owner = user.firmRole === FirmRole.OWNER;

  if (!subscriptionAllowsWrites(user.subscriptionStatus)) {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
        {d.trial.readOnly} —{' '}
        {owner ? (
          <Link href="/account/billing" className="font-medium underline">{d.trial.choosePlan}</Link>
        ) : (
          d.subscription.contactOwner
        )}
      </div>
    );
  }
  if (user.subscriptionStatus !== SubscriptionStatus.TRIAL) return null;

  const days = user.trialEndAt
    ? Math.max(0, Math.ceil((new Date(user.trialEndAt).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div
      className={cn(
        'border-b px-4 py-2 text-center text-sm',
        days <= 7 ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-primary/20 bg-primary/5 text-primary',
      )}
    >
      {fmt(d.trial.daysRemaining, { days })}{' '}
      {owner && (
        <Link href="/account/billing" className="font-medium underline">
          {d.trial.subscribeNow}
        </Link>
      )}
    </div>
  );
}
