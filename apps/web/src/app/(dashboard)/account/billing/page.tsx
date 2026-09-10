'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BillingPeriod, FirmRole, PLAN_CONFIG, planPriceThb, SubscriptionPlan, SubscriptionStatus } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, BillingInvoiceItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { OmiseEmbeddedCheckout } from '@/components/billing/OmiseEmbeddedCheckout';
import { BillingPeriodToggle } from '@/components/billing/BillingPeriodToggle';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';

const INVOICE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'รอชำระ',
  PAID: 'ชำระแล้ว',
  FAILED: 'ล้มเหลว',
};

export default function BillingPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<p className="text-muted-foreground">{d.billing.loadingPlans}</p>}>
      <BillingPageContent />
    </Suspense>
  );
}

function BillingPageContent() {
  const { user, token } = useAuth();
  const { locale } = useLocale();
  const d = useDashboardT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.getPlans>>>([]);
  const [history, setHistory] = useState<BillingInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoOpenPlan, setAutoOpenPlan] = useState<SubscriptionPlan | null>(null);
  const [paymentError, setPaymentError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(BillingPeriod.MONTHLY);
  const loc = dateLocale(locale);

  useEffect(() => {
    if (user && user.firmRole !== FirmRole.OWNER) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    const t = token ?? getStoredToken();
    if (!t) return;
    setLoadError('');
    Promise.all([api.getPlans(t), api.getBillingHistory(t)])
      .then(([p, h]) => {
        setPlans(p);
        setHistory(h);
      })
      // Without this a failed load rendered an empty plan grid and "no
      // payments" — an owner would read that as the truth about their account.
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.billing.loadFailed))
      .finally(() => setLoading(false));
  }, [token, d.billing.loadFailed]);

  useEffect(() => {
    const planParam = searchParams.get('plan') as SubscriptionPlan | null;
    if (planParam && !loading) {
      const selected = plans.find((p) => p.plan === planParam && !p.isCurrent);
      if (selected) {
        setAutoOpenPlan(planParam);
        router.replace('/account/billing');
      }
    }
  }, [searchParams, plans, loading, router]);

  const handleCancel = async () => {
    if (cancelling) return;
    if (!confirm(d.billing.cancelConfirm)) return;
    const t = token ?? getStoredToken();
    if (!t) return;
    setCancelling(true);
    setPaymentError('');
    try {
      await api.cancelSubscription(t);
      window.location.reload();
    } catch (err) {
      // The reload used to happen either way, so a failed cancellation looked
      // exactly like a successful one.
      setPaymentError(err instanceof Error ? err.message : d.billing.cancelFailed);
      setCancelling(false);
    }
  };

  const handlePaymentSuccess = () => {
    window.location.href = '/account/billing?success=1';
  };

  if (!user || user.firmRole !== FirmRole.OWNER) return null;

  const statusBadge = () => {
    switch (user.subscriptionStatus) {
      case SubscriptionStatus.TRIAL:
        return <Badge variant="filed">{d.billing.trial}</Badge>;
      case SubscriptionStatus.ACTIVE:
        return <Badge variant="default">{d.billing.active}</Badge>;
      case SubscriptionStatus.EXPIRED:
        return <Badge variant="destructive">{d.billing.expired}</Badge>;
      default:
        return <Badge variant="muted">{user.subscriptionStatus}</Badge>;
    }
  };

  const paymentSuccess = searchParams.get('success') === '1';

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.billing.title}
        description={fmt(d.billing.description, { firmName: user.firmName })}
      />

      {paymentSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {d.billing.paymentSuccess}
        </div>
      )}

      {loadError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {paymentError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {paymentError}
        </div>
      )}

      {user.subscriptionStatus === SubscriptionStatus.EXPIRED && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {d.billing.trialExpired}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm">{d.billing.currentStatus}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {statusBadge()}
            <p className="text-2xl font-bold">{user.subscriptionPlan ? PLAN_CONFIG[user.subscriptionPlan].name : d.billing.trial}</p>
            {user.trialEndAt && user.subscriptionStatus === SubscriptionStatus.TRIAL && (
              <p className="text-sm text-muted-foreground">
                {fmt(d.billing.trialEnds, {
                  date: new Date(user.trialEndAt).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }),
                })}
              </p>
            )}
            {user.currentPeriodEnd && user.subscriptionStatus === SubscriptionStatus.ACTIVE && (
              <p className="text-sm text-muted-foreground">
                {fmt(d.billing.renews, {
                  date: new Date(user.currentPeriodEnd).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }),
                })}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{d.billing.teamSeats}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(d.billing.maxUsers, { count: user.maxUsers })}</p>
            <p className="text-sm text-muted-foreground">{d.billing.seatsHint}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{d.billing.actions}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {user.subscriptionStatus === SubscriptionStatus.ACTIVE && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={cancelling}
                onClick={handleCancel}
              >
                {d.billing.cancelSubscription}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">{d.billing.plans}</h2>
        {loading ? (
          <p className="text-muted-foreground">{d.billing.loadingPlans}</p>
        ) : (
          <>
          <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} className="mb-4 justify-start" />
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => {
              const yearly = billingPeriod === BillingPeriod.YEARLY;
              const total = planPriceThb(plan.plan as SubscriptionPlan, billingPeriod);
              const shownMonthly = yearly ? Math.round(total / 12) : plan.priceThb;
              return (
              <Card key={plan.plan} className={plan.isCurrent ? 'border-primary ring-2 ring-primary/20' : ''}>
                <CardContent className="space-y-4 p-6">
                  <div>
                    <h3 className="font-semibold">{plan.name}</h3>
                    <p className="text-2xl font-bold text-primary">
                      {shownMonthly.toLocaleString(loc)}{' '}
                      <span className="text-sm font-normal text-muted-foreground">{d.billing.perMonth}</span>
                    </p>
                    {yearly && (
                      <p className="text-xs text-muted-foreground">
                        {fmt(d.billing.billedYearly, {
                          amount: total.toLocaleString(loc),
                          monthly: shownMonthly.toLocaleString(loc),
                        })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {fmt(d.billing.upToUsers, { count: plan.maxUsers })}
                    </p>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-success" />{f}
                      </li>
                    ))}
                  </ul>
                  <OmiseEmbeddedCheckout
                    plan={{
                      plan: plan.plan as SubscriptionPlan,
                      name: plan.name,
                      priceThb: plan.priceThb,
                      billingPeriod,
                    }}
                    className="w-full"
                    variant={plan.isCurrent ? 'outline' : 'default'}
                    disabled={plan.isCurrent}
                    autoOpen={autoOpenPlan === plan.plan}
                    onSuccess={handlePaymentSuccess}
                    onError={setPaymentError}
                  >
                    {plan.isCurrent ? d.billing.currentPlan : d.billing.subscribe}
                  </OmiseEmbeddedCheckout>
                </CardContent>
              </Card>
              );
            })}
          </div>
          </>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>{d.billing.paymentHistory}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left">{d.billing.invoice}</th>
                <th className="px-4 py-3 text-left">{d.billing.plan}</th>
                <th className="px-4 py-3 text-right">{d.billing.amount}</th>
                <th className="px-4 py-3 text-left">{d.billing.status}</th>
                <th className="px-4 py-3 text-left">{d.billing.date}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((inv) => (
                <tr key={inv.id} className="border-b">
                  <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">{PLAN_CONFIG[inv.plan as SubscriptionPlan]?.name ?? inv.plan}</td>
                  <td className="px-4 py-3 text-right">{inv.amount.toLocaleString(loc)} THB</td>
                  <td className="px-4 py-3"><Badge variant={inv.status === 'PAID' ? 'default' : 'muted'}>{INVOICE_STATUS_LABELS[inv.status] ?? inv.status}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{d.billing.noPayments}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
