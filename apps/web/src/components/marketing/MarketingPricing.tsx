'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Check, Download, CreditCard, Users, Wrench } from 'lucide-react';
import { PLAN_CONFIG, SubscriptionPlan, YEARLY_BILLED_MONTHS } from '@lawfirm/shared';
import { fbTrack } from '@/components/FacebookPixel';
import { landingCopy } from '@/lib/i18n/landing';
import type { Lang } from '@/lib/marketing/i18n';
import { demoHref } from '@/components/landing/contact';
import { perPersonMonthly } from '@/components/landing/pricing-math';

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

export function MarketingPricing({ lang = 'th' }: { lang?: Lang }) {
  const locale = lang;
  const p = landingCopy[lang].pricing;
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
  const freeCfg = PLAN_CONFIG[SubscriptionPlan.FREE];
  const plans = [
    {
      key: 'free' as const,
      name: freeCfg.name,
      tagline: p.plans.free.tagline,
      users: p.users.replace('{count}', num(freeCfg.maxUsers)),
      features: p.plans.free.features as readonly string[],
      price: 0 as number | null,
      yearlyTotal: null,
      priceLabel: num(0),
      perUser: null,
      maxUsers: freeCfg.maxUsers,
      popular: false,
      href: '/register',
      cta: p.plans.free.cta,
    },
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
    <section id="pricing" className="mx-auto max-w-[1240px] px-4 py-16 md:px-6">
      <div className="text-center">
        <h2 className="font-display text-3xl font-semibold md:text-4xl">{p.title}</h2>
        <p className="mt-3 text-mk-ink-2">{p.subtitle}</p>
        <div className="mt-8 inline-flex flex-wrap justify-center gap-1 rounded-lg border border-mk-rule p-1">
          <button
            type="button"
            aria-pressed={!yearly}
            onClick={() => setYearly(false)}
            className={`min-h-11 whitespace-nowrap rounded-md px-4 text-sm ${!yearly ? 'bg-mk-ink text-mk-paper' : ''}`}
          >
            {p.billingMonthly}
          </button>
          <button
            type="button"
            aria-pressed={yearly}
            onClick={() => setYearly(true)}
            className={`min-h-11 whitespace-nowrap rounded-md px-4 text-sm ${yearly ? 'bg-mk-ink text-mk-paper' : ''}`}
          >
            {p.billingYearly} · {p.yearlySave}
          </button>
        </div>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {plans.map((plan) => (
          <div key={plan.key} className="flex min-w-0 flex-col rounded-lg border border-mk-rule bg-mk-surface p-5">
            {plan.popular && (
              <p className="text-sm font-semibold text-mk-brass">{locale === 'th' ? 'ยอดนิยม' : 'Popular'}</p>
            )}
            <h3 className="font-display text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-mk-ink-2">{plan.tagline}</p>
            <div className="mt-5">
              <span className="font-display text-3xl font-semibold">{plan.priceLabel}</span>
              {plan.price !== null && <span className="ml-1 text-sm text-mk-ink-2">{p.perMonth}</span>}
              {yearly && plan.yearlyTotal !== null && (
                <p className="mt-1 text-xs text-mk-ink-2">{p.yearlyNote.replace('{amount}', num(plan.yearlyTotal))}</p>
              )}
            </div>
            <p className="mt-2 text-xs text-mk-ink-2">
              {plan.key === 'free' ? (
                p.plans.free.note
              ) : plan.perUser === null ? (
                locale === 'th' ? (
                  'ประเมินตามการใช้งาน'
                ) : (
                  'Priced to your usage'
                )
              ) : (
                <>
                  <span className="whitespace-nowrap">
                    {locale === 'th'
                      ? `≈ ${num(plan.perUser)} บาท/คน/เดือน`
                      : `≈ ${num(plan.perUser)} THB/person/month`}
                  </span>
                  {' · '}
                  <span className="whitespace-nowrap">
                    {locale === 'th' ? `ครบ ${num(plan.maxUsers)} คน` : `${num(plan.maxUsers)} seats used`}
                  </span>
                </>
              )}
            </p>
            <p className="mt-2 text-sm text-mk-ink-2">{plan.users}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {plan.features.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            {plan.key === 'enterprise' ? (
              <a
                href={plan.href}
                onClick={() => fbTrack('Lead')}
                className="mt-6 flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-mk-ink px-3 text-sm font-medium"
              >
                {plan.cta}
              </a>
            ) : (
              <Link
                href={plan.href}
                className="mt-6 flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg bg-mk-ink px-3 text-sm font-medium text-mk-paper"
              >
                {plan.cta}
              </Link>
            )}
          </div>
        ))}
      </div>
      <div className="mt-12 border-t border-mk-rule pt-8">
        <h3 className="font-display text-xl font-semibold">{p.finePrintTitle}</h3>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {p.finePrint.map((item, i) => {
            const Icon = detailIcons[i];
            return (
              <div key={item.title}>
                <Icon size={21} aria-hidden="true" />
                <h4 className="mt-2 font-semibold">{item.title}</h4>
                <p className="mt-1 text-sm text-mk-ink-2">{item.detail}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-mk-ink-2">{p.grandfather}</p>
      </div>
    </section>
  );
}
