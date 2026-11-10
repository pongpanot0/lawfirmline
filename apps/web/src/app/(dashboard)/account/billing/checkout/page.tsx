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

  return <div role="status" className="rounded-lg border bg-card p-4"><h1 className="font-semibold">กำลังเปิดหน้าชำระค่าแพ็กเกจ</h1><p className="mt-1 text-sm text-muted-foreground">{d.billing.redirecting}</p></div>;
}

export default function BillingCheckoutPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<p className="text-muted-foreground">{d.common.loading}</p>}>
      <CheckoutRedirect />
    </Suspense>
  );
}
