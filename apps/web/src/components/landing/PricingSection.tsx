'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Sparkle } from 'lucide-react';
import { fbTrack } from '@/components/FacebookPixel';
import { useLocale } from './LocaleProvider';
import { demoHref } from './contact';

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

export function PricingSection() {
  const { locale, t } = useLocale();
  const p = t.pricing;
  const [yearly, setYearly] = useState(false);

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
      href: key === 'enterprise' ? demoHref : '/register',
      cta: key === 'enterprise' ? p.contactSales : p.tryFree,
    };
  });

  return (
    <section id="pricing" className="lf-section">
      <div className="lf-shell">
        <div className="lf-section-head lf-section-head--center">
          <span className="lf-kicker">Pricing</span>
          <h2 className="lf-display-s mt-3" style={{ fontSize: 'var(--text-display-s)' }}>{p.title}</h2>
          <p className="lf-lede mt-3">{p.subtitle}</p>
        </div>

        {/* Early Access offer — the commercial hook; list prices below stay as the anchor */}
        <div
          className="mx-auto mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border px-4 py-3 text-sm sm:items-center"
          style={{ borderColor: 'var(--color-accent-line)', background: 'var(--color-accent-soft)', color: 'var(--color-ink)' }}
        >
          <Sparkle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" style={{ color: 'var(--color-accent)' }} />
          <p className="font-medium">{p.earlyAccess}</p>
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
              {plan.key === 'enterprise' ? (
                <a
                  href={plan.href}
                  onClick={() => fbTrack('Lead')}
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

        {/* Comparison table — mobile scroll */}
        <div className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:mt-12 sm:px-0">
          <div className="min-w-[320px] overflow-hidden rounded-xl border" style={{ borderColor: 'var(--color-rule)' }}>
            <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
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
