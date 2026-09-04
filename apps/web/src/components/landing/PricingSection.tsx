'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Check } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useLocale } from './LocaleProvider';

const PLAN_KEYS = ['solo', 'firm', 'professional', 'enterprise'] as const;
const PLAN_PRICES = {
  solo: { price: 990, priceLabel: '990', perUser: 990, popular: false },
  firm: { price: 2999, priceLabel: '2,999', perUser: 600, popular: true },
  professional: { price: 6999, priceLabel: '6,999', perUser: 350, popular: false },
  enterprise: { price: null, priceLabel: 'Custom', perUser: null, popular: false },
};

const PLAN_NAMES: Record<(typeof PLAN_KEYS)[number], string> = {
  solo: 'Solo',
  firm: 'Firm',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

function formatBaht(value: number, locale: 'th' | 'en') {
  return locale === 'th'
    ? `${value.toLocaleString('th-TH')} ฿`
    : `${value.toLocaleString('en-US')} THB`;
}

function PriceTooltip({
  active,
  payload,
  locale,
}: {
  active?: boolean;
  payload?: { value: number; payload: { name: string } }[];
  locale: 'th' | 'en';
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="font-medium">{payload[0].payload.name}</p>
      <p className="text-primary">{formatBaht(payload[0].value, locale)}</p>
    </div>
  );
}

function PerUserTooltip({
  active,
  payload,
  locale,
  suffix,
}: {
  active?: boolean;
  payload?: { value: number; payload: { name: string } }[];
  locale: 'th' | 'en';
  suffix: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card">
      <p className="font-medium">{payload[0].payload.name}</p>
      <p className="text-success">
        {formatBaht(payload[0].value, locale)}
        {suffix}
      </p>
    </div>
  );
}

export function PricingSection() {
  const { locale, t } = useLocale();
  const p = t.pricing;
  const [chartsReady, setChartsReady] = useState(false);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    setChartsReady(true);
  }, []);

  const plans = PLAN_KEYS.map((key) => {
    const base = PLAN_PRICES[key].price;
    // Yearly = pay 10 months (2 months free); card shows the monthly-equivalent price
    const shown = base !== null && yearly ? Math.round((base * 10) / 12) : base;
    return {
      key,
      name: PLAN_NAMES[key],
      users: p.plans[key].users,
      features: p.plans[key].features,
      price: shown,
      yearlyTotal: base !== null ? base * 10 : null,
      priceLabel:
        key === 'enterprise'
          ? p.plans.enterprise.priceLabel
          : (shown as number).toLocaleString(locale === 'th' ? 'th-TH' : 'en-US'),
      perUser: PLAN_PRICES[key].perUser,
      popular: PLAN_PRICES[key].popular,
      href: key === 'enterprise' ? 'mailto:hello@lexflow.co?subject=LexFlow Enterprise' : '/login',
      cta: key === 'enterprise' ? p.contactSales : p.tryFree,
    };
  });

  const priceChartData = plans
    .filter((plan) => plan.price !== null)
    .map((plan) => ({
      name: plan.name,
      price: plan.price,
      fill: plan.popular ? 'hsl(224 76% 48%)' : 'hsl(224 76% 72%)',
    }));

  const perUserChartData = plans
    .filter((plan) => plan.perUser !== null)
    .map((plan) => ({
      name: plan.name,
      perUser: plan.perUser,
      fill: plan.popular ? 'hsl(152 60% 40%)' : 'hsl(152 60% 65%)',
    }));

  return (
    <section id="pricing" className="py-12 sm:py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{p.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">{p.subtitle}</p>
        </div>

        {/* Billing period toggle */}
        <div className="mt-6 flex items-center justify-center gap-1 sm:mt-8">
          <div className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                !yearly ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {p.billingMonthly}
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                yearly ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {p.billingYearly}
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                {p.yearlySave}
              </span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="mt-8 grid gap-4 sm:mt-12 sm:gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <Card
              key={plan.key}
              className={cn(
                'relative flex flex-col border-border/80 shadow-card transition-shadow hover:shadow-lg',
                plan.popular && 'border-primary ring-2 ring-primary/20',
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                  {p.recommended}
                </span>
              )}
              <CardContent className="flex flex-1 flex-col p-5 sm:p-6">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.users}</p>
                <div className="mt-4 sm:mt-5">
                  <span className="text-2xl font-bold text-primary sm:text-3xl">{plan.priceLabel}</span>
                  {plan.price !== null && (
                    <span className="ml-1 text-xs text-muted-foreground sm:text-sm">{p.perMonth}</span>
                  )}
                  {plan.price === null && (
                    <p className="mt-1 text-sm text-muted-foreground">{p.contactUs}</p>
                  )}
                  {yearly && plan.yearlyTotal !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.yearlyNote.replace(
                        '{amount}',
                        plan.yearlyTotal.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US'),
                      )}
                    </p>
                  )}
                </div>
                {plan.perUser !== null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.perUser.replace('{amount}', plan.perUser.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US'))}
                  </p>
                )}
                <ul className="mt-5 flex-1 space-y-2 text-sm sm:mt-6">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      {item}
                    </li>
                  ))}
                </ul>
                {plan.href.startsWith('mailto') ? (
                  <a
                    href={plan.href}
                    className={cn(
                      buttonVariants({ variant: plan.popular ? 'default' : 'outline', size: 'default' }),
                      'mt-5 w-full sm:mt-6',
                    )}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    href={plan.href}
                    className={cn(
                      buttonVariants({ variant: plan.popular ? 'default' : 'outline', size: 'default' }),
                      'mt-5 w-full sm:mt-6',
                    )}
                  >
                    {plan.cta}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts */}
        <div className="mt-10 grid gap-5 sm:mt-16 sm:gap-8 lg:grid-cols-2">
          <Card className="border-border/80 shadow-card">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-sm font-semibold sm:text-base">{p.chartMonthly}</h3>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{p.chartMonthlyDesc}</p>
              <div className="mt-4 h-52 min-h-0 min-w-0 sm:mt-6 sm:h-64">
                {chartsReady ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={priceChartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                        width={36}
                      />
                      <Tooltip
                        content={<PriceTooltip locale={locale} />}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                      />
                      <Bar dataKey="price" radius={[6, 6, 0, 0]} maxBarSize={48}>
                        {priceChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-card">
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-sm font-semibold sm:text-base">{p.chartPerUser}</h3>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{p.chartPerUserDesc}</p>
              <div className="mt-4 h-52 min-h-0 min-w-0 sm:mt-6 sm:h-64">
                {chartsReady ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={perUserChartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                        tickLine={false}
                        interval={0}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (locale === 'th' ? `${v}฿` : `${v}`)}
                        width={36}
                      />
                      <Tooltip
                        content={<PerUserTooltip locale={locale} suffix={p.perUserTooltip} />}
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                      />
                      <Bar dataKey="perUser" radius={[6, 6, 0, 0]} maxBarSize={48}>
                        {perUserChartData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Comparison table — mobile scroll */}
        <div className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:mt-12 sm:px-0">
          <div className="min-w-[320px] overflow-hidden rounded-xl border border-border shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-semibold sm:px-6 sm:py-4">{p.tablePackage}</th>
                  <th className="px-4 py-3 text-left font-semibold sm:px-6 sm:py-4">{p.tableUsers}</th>
                  <th className="px-4 py-3 text-right font-semibold sm:px-6 sm:py-4">{p.tablePrice}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan, i) => (
                  <tr
                    key={plan.key}
                    className={cn(
                      'border-b border-border last:border-0',
                      plan.popular && 'bg-primary/5',
                      i % 2 === 0 && !plan.popular && 'bg-card',
                    )}
                  >
                    <td className="px-4 py-3 font-medium sm:px-6 sm:py-4">
                      <span className="block sm:inline">{plan.name}</span>
                      {plan.popular && (
                        <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary sm:ml-2 sm:mt-0">
                          {p.recommended}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground sm:px-6 sm:py-4">{plan.users}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium sm:px-6 sm:py-4">
                      {plan.price !== null ? `${plan.priceLabel} ${p.perMonth}` : plan.priceLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
