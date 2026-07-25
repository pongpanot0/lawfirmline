'use client';

import { usePathname } from 'next/navigation';
import { SubscriptionStatus } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { ExpiredPlanPicker } from '@/components/billing/ExpiredPlanPicker';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const BILLING_PATHS = ['/account/billing', '/account/billing/checkout'];

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const d = useDashboardT();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-muted-foreground">{d.common.loading}</p>
      </div>
    );
  }

  const isBillingFlow = BILLING_PATHS.some((p) => pathname.startsWith(p));

  const allowed =
    user &&
    (user.subscriptionStatus === SubscriptionStatus.TRIAL ||
      user.subscriptionStatus === SubscriptionStatus.ACTIVE ||
      user.subscriptionStatus === SubscriptionStatus.PAST_DUE);

  if (!allowed && !isBillingFlow) {
    return <ExpiredPlanPicker />;
  }

  return <>{children}</>;
}
