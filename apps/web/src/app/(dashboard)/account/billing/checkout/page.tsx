'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDashboardT } from '@/components/landing/LocaleProvider';

function CheckoutRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');
  const d = useDashboardT();

  useEffect(() => {
    router.replace(plan ? `/account/billing?plan=${plan}` : '/account/billing');
  }, [router, plan]);

  return <p className="text-muted-foreground">{d.billing.redirecting}</p>;
}

export default function BillingCheckoutPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<p className="text-muted-foreground">{d.common.loading}</p>}>
      <CheckoutRedirect />
    </Suspense>
  );
}
