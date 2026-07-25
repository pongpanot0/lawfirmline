'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FirmRole, SubscriptionPlan } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { OmiseEmbeddedCheckout } from '@/components/billing/OmiseEmbeddedCheckout';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';

export function ExpiredPlanPicker() {
  const { user } = useAuth();
  const { locale } = useLocale();
  const d = useDashboardT();
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.getPlans>>>([]);
  const [loading, setLoading] = useState(true);
  const [paymentError, setPaymentError] = useState('');
  const loc = dateLocale(locale);

  const isOwner = user?.firmRole === FirmRole.OWNER;

  useEffect(() => {
    const token = getStoredToken();
    if (!token || !isOwner) {
      setLoading(false);
      return;
    }
    api.getPlans(token)
      .then(setPlans)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (!isOwner) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h2 className="text-xl font-semibold">{d.subscription.required}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{d.subscription.contactOwner}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold">{d.subscription.expiredTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{d.subscription.expiredDesc}</p>
      </div>

      {paymentError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-900">
          {paymentError}
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground">{d.subscription.loadingPlans}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.plan}>
              <CardContent className="space-y-4 p-6">
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <p className="text-2xl font-bold text-primary">
                    {plan.priceThb.toLocaleString(loc)}{' '}
                    <span className="text-sm font-normal text-muted-foreground">{d.billing.perMonth}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(d.billing.upToUsers, { count: plan.maxUsers })}
                  </p>
                </div>
                <ul className="space-y-1 text-sm">
                  {plan.features.slice(0, 4).map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
                <OmiseEmbeddedCheckout
                  plan={{
                    plan: plan.plan as SubscriptionPlan,
                    name: plan.name,
                    priceThb: plan.priceThb,
                  }}
                  className="w-full"
                  onSuccess={() => {
                    window.location.href = '/account/billing?success=1';
                  }}
                  onError={setPaymentError}
                >
                  {d.subscription.selectAndPay}
                </OmiseEmbeddedCheckout>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/account/billing" className="text-primary hover:underline">
          {d.subscription.viewBilling}
        </Link>
      </p>
    </div>
  );
}
