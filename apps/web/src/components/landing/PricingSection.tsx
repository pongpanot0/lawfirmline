'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, Download, CreditCard, Users, Wrench } from 'lucide-react';
import { PLAN_CONFIG, SubscriptionPlan, YEARLY_BILLED_MONTHS } from '@lawfirm/shared';
import { fbTrack } from '@/components/FacebookPixel';
import { useLocale } from './LocaleProvider';
import { demoHref } from './contact';
import { perPersonMonthly } from './pricing-math';

// Prices and seats come from PLAN_CONFIG — the same numbers checkout charges.
// Solo (one person) is not sold: Apple 3.1.3(c) allows selling outside In-App Purchase to
// organisations only. Existing Solo firms keep their plan.
const PAID_PLANS = [
  ['team', SubscriptionPlan.TEAM],
  ['firm', SubscriptionPlan.FIRM],
  ['professional', SubscriptionPlan.PROFESSIONAL],
] as const;
const POPULAR = 'team';
const detailIcons = [CreditCard, CalendarDays, Users, Wrench, Download];

export function PricingSection() {
  const { locale, t } = useLocale();
  const p = t.pricing;
  const [yearly, setYearly] = useState(false);
  const num = (n: number) => n.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US');

  const paid = PAID_PLANS.map(([key, plan]) => {
    const cfg = PLAN_CONFIG[plan];
    // Yearly = pay 10 months (2 months free); card shows the monthly-equivalent price
    const shown = yearly ? Math.round((cfg.priceThb * YEARLY_BILLED_MONTHS) / 12) : cfg.priceThb;
    return {
      key,
      name: cfg.name,
      tagline: p.plans[key].tagline,
      users: (cfg.maxUsers === 1 ? p.users : p.upToUsers).replace('{count}', num(cfg.maxUsers)),
      features: p.plans[key].features as readonly string[],
      price: shown as number | null,
      yearlyTotal: (cfg.priceThb * YEARLY_BILLED_MONTHS) as number | null,
      priceLabel: num(shown),
      perUser: cfg.maxUsers > 1 ? perPersonMonthly(cfg.priceThb, cfg.maxUsers, yearly, YEARLY_BILLED_MONTHS) : null,
      maxUsers: cfg.maxUsers,
      popular: key === POPULAR,
      href: '/register',
      cta: p.tryFree,
    };
  });
  const plans = [
    ...paid,
    {
      key: 'enterprise' as const,
      name: 'Enterprise',
      tagline: p.plans.enterprise.tagline,
      users: p.plans.enterprise.users,
      features: p.plans.enterprise.features as readonly string[],
      price: null,
      yearlyTotal: null,
      priceLabel: p.plans.enterprise.priceLabel,
      perUser: null,
      maxUsers: 0,
      popular: false,
      href: demoHref,
      cta: locale === 'th' ? 'ติดต่อฝ่ายขาย' : 'Contact sales',
    },
  ];

  return (
    <section id="pricing" data-section className="lf-section">
      <div className="lf-shell">
        <div className="lf-section-head lf-section-head--center">
          <h2 className="lf-display-s" style={{ fontSize: 'var(--text-display-s)' }} data-motion="head">{p.title}</h2>
          <p className="lf-lede mt-3">{p.subtitle}</p>
        </div>

        {/* Billing period toggle */}
        <div className="mt-6 flex items-center justify-center sm:mt-8">
          <div className="inline-flex items-center rounded-lg border p-1" style={{ borderColor: 'var(--color-rule)' }}>
            <button
              type="button"
              onClick={() => setYearly(false)}
              aria-pressed={!yearly}
              className="lf-toggle min-h-11 rounded-md px-4 text-sm font-medium transition-colors"
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
              aria-pressed={yearly}
              className="lf-toggle flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
              style={
                yearly
                  ? { background: 'var(--color-paper-3)', color: 'var(--color-ink)' }
                  : { color: 'var(--color-ink-2)' }
              }
            >
              {p.billingYearly}
              <span
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: 'color-mix(in oklab, var(--color-success) 15%, transparent)', color: 'color-mix(in oklab, var(--color-success) 80%, var(--color-ink))' }}
              >
                {p.yearlySave}
              </span>
            </button>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="lf-pricing-grid mt-8 sm:mt-12">
          {plans.map((plan) => (
            <div
              key={plan.key}
              data-motion="price-card"
              className="lf-pricing-card relative rounded-lg border p-5 sm:p-6"
              style={{
                borderColor: plan.popular ? 'var(--color-accent)' : 'var(--color-rule)',
                background: 'var(--color-paper-3)',
                // Inset ring doubles the hairline without shifting layout against sibling cards.
                boxShadow: plan.popular ? 'inset 0 0 0 1px var(--color-accent)' : 'none',
              }}
            >
              <h3 className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
                {plan.name}
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-2)' }}>
                {plan.tagline}
              </p>
              <div className="mt-4 sm:mt-5">
                <span className="lf-display-s text-2xl sm:text-3xl">{plan.priceLabel}</span>
                {plan.price !== null && (
                  <span className="ml-1 text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }}>
                    {p.perMonth}
                  </span>
                )}
                {yearly && plan.yearlyTotal !== null && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-2)' }}>
                    {p.yearlyNote.replace('{amount}', num(plan.yearlyTotal))}
                  </p>
                )}
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--color-ink-2)' }}>
                {plan.perUser === null
                  ? (locale === 'th' ? 'ประเมินตามการใช้งาน' : 'Priced to your usage')
                  : <><span className="whitespace-nowrap">{locale === 'th' ? `≈ ${num(plan.perUser)} บาท/คน/เดือน` : `≈ ${num(plan.perUser)} THB/person/month`}</span>{' · '}<span className="whitespace-nowrap">{locale === 'th' ? `ครบ ${num(plan.maxUsers)} คน` : `${num(plan.maxUsers)} seats used`}</span></>}
              </p>
              <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-2)' }}>{plan.users}</p>
              <ul className="mt-5 space-y-2 text-sm sm:mt-6">
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

        <div className="lf-pricing-details">
          <h3>{p.finePrintTitle}</h3>
          <div className="lf-pricing-details-grid">
            {p.finePrint.map((item, i) => {
              const Icon = detailIcons[i];
              return <div className="lf-pricing-detail" key={item.title} data-reveal>
                <Icon size={21} aria-hidden="true" />
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
              </div>;
            })}
          </div>
          <p className="lf-pricing-grandfather">{p.grandfather}</p>
        </div>
      </div>
    </section>
  );
}
