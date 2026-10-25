'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BillingPeriod, hasFirmCapability, PLAN_CONFIG, planPriceThb, SubscriptionPlan, SubscriptionStatus } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, BillingInvoiceItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight, Check } from 'lucide-react';
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
    <Suspense fallback={<p role="status" className="text-muted-foreground">{d.billing.loadingPlans}</p>}>
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
  const [redirecting, setRedirecting] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(BillingPeriod.MONTHLY);
  const [reload, setReload] = useState(0);
  const loc = dateLocale(locale);

  useEffect(() => {
    if (user && !hasFirmCapability(user.firmRole, 'manageSubscription')) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    const t = token ?? getStoredToken();
    if (!t) return;
    setLoadError('');
    setLoading(true);
    Promise.all([api.getPlans(t), api.getBillingHistory(t)])
      .then(([p, h]) => {
        setPlans(p);
        setHistory(h);
      })
      // Without this a failed load rendered an empty plan grid and "no
      // payments" — an owner would read that as the truth about their account.
      .catch((err) => setLoadError(err instanceof Error ? err.message : d.billing.loadFailed))
      .finally(() => setLoading(false));
  }, [token, d.billing.loadFailed, reload]);

  useEffect(() => {
    const planParam = searchParams.get('plan') as SubscriptionPlan | null;
    if (planParam && !loading) {
      const selected = plans.find((p) => p.plan === planParam && !p.isCurrent);
      if (selected) {
        router.replace('/account/billing');
        void goToStripe(() => api.checkout(token ?? getStoredToken() ?? '', planParam, billingPeriod));
      }
    }
  }, [searchParams, plans, loading, router]);

  const handleCancel = async () => {
    if (cancelling) return;
    if (!confirm(`${d.billing.cancelConfirm}\n${user?.subscriptionPlan ? PLAN_CONFIG[user.subscriptionPlan].name : ''}`)) return;
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

  // Payment happens on Stripe's hosted pages; we only fetch the URL and leave.
  async function goToStripe(open: () => Promise<{ url: string }>) {
    if (redirecting) return;
    setRedirecting(true);
    setPaymentError('');
    try {
      window.location.assign((await open()).url);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : d.billing.loadFailed);
      setRedirecting(false);
    }
  }
  const authToken = () => token ?? getStoredToken() ?? '';

  if (!user || !hasFirmCapability(user.firmRole, 'manageSubscription')) return null;

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
  const canManagePayment = user.subscriptionStatus === SubscriptionStatus.ACTIVE || user.subscriptionStatus === SubscriptionStatus.PAST_DUE;
  const formatDay = (value: string | Date) => new Date(value).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.billing.title}
        description={fmt(d.billing.description, { firmName: user.firmName })}
        actions={canManagePayment ? (
          <Button
            className="whitespace-normal text-left"
            disabled={redirecting}
            onClick={() => goToStripe(() => api.billingPortal(authToken()))}
          >
            {d.billing.manageBilling}
          </Button>
        ) : undefined}
      />

      {paymentSuccess && (
        <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {d.billing.paymentSuccess}
        </div>
      )}

      {paymentError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {paymentError}
        </div>
      )}

      {user.subscriptionStatus === SubscriptionStatus.EXPIRED && (
        <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground">
          {d.billing.trialExpired}
        </div>
      )}

      <section aria-label={d.billing.currentStatus} className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
        <div className="min-w-0 bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{d.billing.currentStatus}</p>
            {statusBadge()}
          </div>
          <p className="mt-1 text-2xl font-semibold">{user.subscriptionPlan ? PLAN_CONFIG[user.subscriptionPlan].name : d.billing.trial}</p>
          {user.trialEndAt && user.subscriptionStatus === SubscriptionStatus.TRIAL && (
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{fmt(d.billing.trialEnds, { date: formatDay(user.trialEndAt) })}</p>
          )}
          {user.currentPeriodEnd && user.subscriptionStatus === SubscriptionStatus.ACTIVE && (
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{fmt(d.billing.renews, { date: formatDay(user.currentPeriodEnd) })}</p>
          )}
        </div>
        <div className="min-w-0 bg-card p-4">
          <p className="text-sm text-muted-foreground">{d.billing.teamSeats}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(d.billing.maxUsers, { count: user.maxUsers })}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{d.billing.seatsHint}</p>
        </div>
      </section>

      <section aria-labelledby="billing-plans-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="billing-plans-heading" className="text-lg font-semibold">{d.billing.plans}</h2>
          {!loading && !loadError && <BillingPeriodToggle value={billingPeriod} onChange={setBillingPeriod} />}
        </div>
        {loading ? (
          <div role="status" aria-label={d.billing.loadingPlans} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-96 w-full rounded-xl" />)}
          </div>
        ) : loadError ? (
          <LoadFailed message={loadError} onRetry={() => setReload((n) => n + 1)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const yearly = billingPeriod === BillingPeriod.YEARLY;
              const total = planPriceThb(plan.plan as SubscriptionPlan, billingPeriod);
              const shownMonthly = yearly ? Math.round(total / 12) : plan.priceThb;
              return (
              <Card
                key={plan.plan}
                aria-current={plan.isCurrent ? 'true' : undefined}
                className={plan.isCurrent ? 'border-2 border-primary' : ''}
              >
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  {/* Same order on every card: name, price, seats, then features. */}
                  <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {plan.isCurrent && <Badge variant="default">{d.billing.currentPlan}</Badge>}
                  </div>
                  <div className="border-b pb-4">
                    <p className="text-3xl font-semibold tabular-nums text-foreground">
                      {shownMonthly.toLocaleString(loc)}{' '}
                      <span className="text-sm font-normal text-muted-foreground">{d.billing.perMonth}</span>
                    </p>
                    <p className="mt-1 min-h-4 text-xs tabular-nums text-muted-foreground">
                      {yearly && fmt(d.billing.billedYearly, {
                        amount: total.toLocaleString(loc),
                        monthly: shownMonthly.toLocaleString(loc),
                      })}
                    </p>
                    <p className="mt-2 text-sm font-medium tabular-nums">
                      {fmt(d.billing.upToUsers, { count: plan.maxUsers })}
                    </p>
                  </div>
                  <ul className="flex-1 space-y-1.5 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />{f}
                      </li>
                    ))}
                  </ul>
                  {plan.isCurrent ? (
                    <p className="flex min-h-11 items-center justify-center rounded-lg bg-muted text-sm font-medium text-muted-foreground">{d.billing.currentPlan}</p>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={redirecting}
                        onClick={() => goToStripe(() => api.checkout(authToken(), plan.plan, billingPeriod))}
                      >
                        {redirecting ? d.billing.redirecting : d.billing.subscribe}
                      </Button>
                      <Button
                        className="w-full whitespace-normal leading-snug"
                        variant="outline"
                        disabled={redirecting}
                        onClick={() => goToStripe(() => api.checkout(authToken(), plan.plan, billingPeriod, 'promptpay'))}
                      >
                        {d.billing.payPromptPay}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card>
        <CardHeader><CardTitle>{d.billing.paymentHistory}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">{d.billing.invoice}</th>
                <th className="px-4 py-3 text-left font-semibold">{d.billing.plan}</th>
                <th className="px-4 py-3 text-right font-semibold">{d.billing.amount}</th>
                <th className="px-4 py-3 text-left font-semibold">{d.billing.status}</th>
                <th className="px-4 py-3 text-left font-semibold">{d.billing.date}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((inv) => (
                <tr key={inv.id} className="border-b">
                  <td className="px-4 py-3 font-medium">
                    {inv.hostedInvoiceUrl ? (
                      <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-primary underline sm:min-h-0" title={d.billing.receipt}>{inv.invoiceNumber}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
                    ) : inv.invoiceNumber}
                  </td>
                  <td className="px-4 py-3">{PLAN_CONFIG[inv.plan as SubscriptionPlan]?.name ?? inv.plan}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inv.amount.toLocaleString(loc)} THB</td>
                  <td className="px-4 py-3"><Badge variant={inv.status === 'PAID' ? 'success' : inv.status === 'FAILED' ? 'destructive' : 'muted'}>{INVOICE_STATUS_LABELS[inv.status] ?? inv.status}</Badge></td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDay(inv.createdAt)}</td>
                </tr>
              ))}
              {history.length === 0 && !loading && !loadError && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">{d.billing.noPayments}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {user.subscriptionStatus === SubscriptionStatus.ACTIVE && (
        <div className="flex justify-end border-t pt-6">
          <Button
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={cancelling}
            onClick={handleCancel}
          >
            {d.billing.cancelSubscription}
          </Button>
        </div>
      )}
    </div>
  );
}
