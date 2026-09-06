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

// Mirrors --color-accent / --color-ink-2 / --color-success from landing-tokens.css —
// recharts fills need literal color strings, not CSS custom properties.
const CHART_ACCENT = 'oklch(62% 0.19 32)';
const CHART_ACCENT_MUTED = 'oklch(62% 0.19 32 / 0.35)';
const CHART_SUCCESS = 'oklch(56% 0.13 152)';
const CHART_SUCCESS_MUTED = 'oklch(56% 0.13 152 / 0.4)';
const CHART_RULE = 'oklch(88% 0.014 50)';
const CHART_INK_2 = 'oklch(46% 0.022 40)';

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
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)' }}
    >
      <p className="font-medium" style={{ color: 'var(--color-ink)' }}>
        {payload[0].payload.name}
      </p>
      <p style={{ color: 'var(--color-accent)' }}>{formatBaht(payload[0].value, locale)}</p>
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
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)' }}
    >
      <p className="font-medium" style={{ color: 'var(--color-ink)' }}>
        {payload[0].payload.name}
      </p>
      <p style={{ color: 'var(--color-success)' }}>
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
      fill: plan.popular ? CHART_ACCENT : CHART_ACCENT_MUTED,
    }));

  const perUserChartData = plans
    .filter((plan) => plan.perUser !== null)
    .map((plan) => ({
      name: plan.name,
      perUser: plan.perUser,
      fill: plan.popular ? CHART_SUCCESS : CHART_SUCCESS_MUTED,
    }));

  return (
    <section id="pricing" className="lf-section">
      <div className="lf-shell">
        <div className="lf-section-head lf-section-head--center">
          <h2 className="lf-display-s text-2xl sm:text-3xl">{p.title}</h2>
          <p className="lf-lede mt-3">{p.subtitle}</p>
        </div>

        {/* Billing period toggle */}
        <div className="mt-6 flex items-center justify-center sm:mt-8">
          <div className="inline-flex items-center rounded-full border p-1" style={{ borderColor: 'var(--color-rule)' }}>
            <button
              type="button"
              onClick={() => setYearly(false)}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                !yearly
                  ? { background: 'var(--color-paper-3)', color: 'var(--color-ink)' }
                  : { color: 'var(--color-ink-2)' }
              }
            >
              {p.billingMonthly}
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
              style={
                yearly
                  ? { background: 'var(--color-paper-3)', color: 'var(--color-ink)' }
                  : { color: 'var(--color-ink-2)' }
              }
            >
              {p.billingYearly}
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: 'color-mix(in oklab, var(--color-success) 15%, transparent)', color: 'var(--color-success)' }}
              >
                {p.yearlySave}
              </span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className="relative flex flex-col rounded-2xl border p-5 sm:p-6"
              data-motion="price-card"
              style={{
                borderColor: plan.popular ? 'var(--color-accent)' : 'var(--color-rule)',
                background: 'var(--color-paper-3)',
                boxShadow: plan.popular ? '0 0 0 3px var(--color-accent-soft)' : 'none',
              }}
            >
              {plan.popular && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-0.5 text-xs font-semibold"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
                >
                  {p.recommended}
                </span>
              )}
              <h3 className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
                {plan.name}
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-2)' }}>
                {plan.users}
              </p>
              <div className="mt-4 sm:mt-5">
                <span className="lf-display-s text-2xl sm:text-3xl">{plan.priceLabel}</span>
                {plan.price !== null && (
                  <span className="ml-1 text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }}>
                    {p.perMonth}
                  </span>
                )}
                {plan.price === null && (
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-2)' }}>
                    {p.contactUs}
                  </p>
                )}
                {yearly && plan.yearlyTotal !== null && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-2)' }}>
                    {p.yearlyNote.replace(
                      '{amount}',
                      plan.yearlyTotal.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US'),
                    )}
                  </p>
                )}
              </div>
              {plan.perUser !== null && (
                <p className="mt-2 text-xs" style={{ color: 'var(--color-ink-2)' }}>
                  {p.perUser.replace('{amount}', plan.perUser.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US'))}
                </p>
              )}
              <ul className="mt-5 flex-1 space-y-2 text-sm sm:mt-6">
                {plan.features.map((item) => (
                  <li key={item} className="flex items-start gap-2" style={{ color: 'var(--color-ink)' }}>
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-success)' }} />
                    {item}
                  </li>
                ))}
              </ul>
              {plan.href.startsWith('mailto') ? (
                <a
                  href={plan.href}
                  className={`lf-btn mt-5 w-full sm:mt-6 ${plan.popular ? 'lf-btn--primary' : 'lf-btn--outline'}`}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link href={plan.href} className={`lf-btn mt-5 w-full sm:mt-6 ${plan.popular ? 'lf-btn--primary' : 'lf-btn--outline'}`}>
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="mt-10 grid gap-5 sm:mt-16 sm:gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border p-4 sm:p-6" style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)' }}>
            <h3 className="text-sm font-semibold sm:text-base" style={{ color: 'var(--color-ink)' }}>
              {p.chartMonthly}
            </h3>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }}>
              {p.chartMonthlyDesc}
            </p>
            <div className="mt-4 h-52 min-h-0 min-w-0 sm:mt-6 sm:h-64">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={priceChartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_RULE} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: CHART_INK_2 }}
                      axisLine={{ stroke: CHART_RULE }}
                      tickLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART_INK_2 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      width={36}
                    />
                    <Tooltip content={<PriceTooltip locale={locale} />} cursor={{ fill: CHART_RULE, opacity: 0.5 }} />
                    <Bar dataKey="price" radius={[6, 6, 0, 0]} maxBarSize={48}>
                      {priceChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border p-4 sm:p-6" style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)' }}>
            <h3 className="text-sm font-semibold sm:text-base" style={{ color: 'var(--color-ink)' }}>
              {p.chartPerUser}
            </h3>
            <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }}>
              {p.chartPerUserDesc}
            </p>
            <div className="mt-4 h-52 min-h-0 min-w-0 sm:mt-6 sm:h-64">
              {chartsReady ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={perUserChartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_RULE} vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11, fill: CHART_INK_2 }}
                      axisLine={{ stroke: CHART_RULE }}
                      tickLine={false}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART_INK_2 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => (locale === 'th' ? `${v}฿` : `${v}`)}
                      width={36}
                    />
                    <Tooltip
                      content={<PerUserTooltip locale={locale} suffix={p.perUserTooltip} />}
                      cursor={{ fill: CHART_RULE, opacity: 0.5 }}
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
          </div>
        </div>

        {/* Comparison table — mobile scroll */}
        <div className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:mt-12 sm:px-0">
          <div className="min-w-[320px] overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-rule)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-2)' }}>
                  <th className="px-4 py-3 text-left font-semibold sm:px-6 sm:py-4" style={{ color: 'var(--color-ink)' }}>
                    {p.tablePackage}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold sm:px-6 sm:py-4" style={{ color: 'var(--color-ink)' }}>
                    {p.tableUsers}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold sm:px-6 sm:py-4" style={{ color: 'var(--color-ink)' }}>
                    {p.tablePrice}
                  </th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr
                    key={plan.key}
                    className="border-b last:border-0"
                    style={{
                      borderColor: 'var(--color-rule)',
                      background: plan.popular ? 'var(--color-accent-soft)' : 'transparent',
                    }}
                  >
                    <td className="px-4 py-3 font-medium sm:px-6 sm:py-4" style={{ color: 'var(--color-ink)' }}>
                      <span className="block sm:inline">{plan.name}</span>
                      {plan.popular && (
                        <span
                          className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs sm:ml-2 sm:mt-0"
                          style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
                        >
                          {p.recommended}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4" style={{ color: 'var(--color-ink-2)' }}>
                      {plan.users}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium sm:px-6 sm:py-4" style={{ color: 'var(--color-ink)' }}>
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
