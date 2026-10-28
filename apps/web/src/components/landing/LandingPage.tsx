'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dashboardScreenshot from '../../../public/marketing/dashboard.png';
import casesScreenshot from '../../../public/marketing/cases-list.png';
import scheduleScreenshot from '../../../public/marketing/court-schedule.png';
import { Check, ArrowRight } from 'lucide-react';
import { PLAN_CONFIG, SubscriptionPlan, TRIAL_DAYS } from '@lawfirm/shared';
import { fbTrack } from '@/components/FacebookPixel';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { useLocale } from './LocaleProvider';
import { demoHref } from './contact';
import { LandingNavbar } from './LandingNavbar';
import { PricingSection } from './PricingSection';
import { useLandingMotion } from './useLandingMotion';
import './landing-tokens.css';

/** Thai has no spaces between words, so the browser may break a heading mid-phrase. Each
 *  space-separated phrase is kept whole and the line breaks fall between phrases. */
function Phrases({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((phrase, i) => (
        <span key={i}>
          {i > 0 && ' '}
          <span className="inline-block">{phrase}</span>
        </span>
      ))}
    </>
  );
}

export function LandingPage() {
  const { locale, t } = useLocale();
  const scope = useLandingMotion();

  return (
    <div className="samnuan-paper lf-landing" ref={scope}>
      <LandingNavbar />

      {/* Hero: the statement, two actions, then one plain price line (price is the first filter
          for small firms). Rendered visible from the server; nothing here waits for script. */}
      <section className="lf-shell lf-section text-center">
        <h1 className="lf-display lf-hero-title mx-auto max-w-5xl">
          <span className="lf-rise block" style={{ "--i": 0 } as CSSProperties}>{t.hero.title}</span>
          <span className="lf-rise block" style={{ color: 'var(--color-accent)', "--i": 1 } as CSSProperties}>
            <Phrases text={t.hero.titleHighlight} />
          </span>
        </h1>
        <p className="lf-rise lf-lede mx-auto mt-6 max-w-2xl text-base sm:text-lg" style={{ "--i": 2 } as CSSProperties}>
          {t.hero.subtitle}
        </p>
        <div className="lf-rise mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center" style={{ "--i": 3 } as CSSProperties}>
          <Link href="/register" className="lf-btn lf-btn--primary w-full sm:w-auto">
            {t.hero.ctaPrimary}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a href={demoHref} onClick={() => fbTrack('Lead')} className="lf-btn lf-btn--outline w-full sm:w-auto">
            {t.hero.ctaSecondary}
          </a>
        </div>
        <p className="lf-rise mt-4 text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)', "--i": 4 } as CSSProperties}>
          {t.hero.note}
        </p>

        <a href="#pricing" className="lf-rise lf-price-line mx-auto mt-10" style={{ "--i": 5 } as CSSProperties}>
          {[
            { value: PLAN_CONFIG[SubscriptionPlan.TEAM].priceThb, unit: t.hero.currency, label: t.hero.facts.team },
            { value: PLAN_CONFIG[SubscriptionPlan.FIRM].priceThb, unit: t.hero.currency, label: t.hero.facts.firm },
            { value: TRIAL_DAYS, unit: t.hero.trialUnit, label: t.hero.facts.trial },
          ].map((fact) => (
            <span key={fact.label} className="lf-price-item">
              <strong style={{ color: 'var(--color-ink)' }}>
                {fact.value.toLocaleString(locale === 'th' ? 'th-TH' : 'en-US')} {fact.unit}
              </strong>{' '}
              {fact.label}
            </span>
          ))}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </a>
      </section>

      {/* Problems — numbered editorial row, the "why" before the product */}
      <section className="lf-section lf-section--tight lf-section--paper2">
        <div className="lf-shell">
          <h2 className="lf-display-s text-center text-xl sm:text-2xl" data-motion="head">{t.problems.title}</h2>
          <ul className="lf-problems mt-8">
            {t.problems.items.map((text) => (
              <li key={text} className="lf-problem" data-motion="problem">
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--color-ink)' }}>
                  {text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Product tour — a full-bleed dark act (era DNA). The real app, not a mockup;
          GSAP converges the two supporting screens onto the main dashboard shot. */}
      <section className="lf-section lf-section--dark lf-snap">
        <div className="lf-shell">
        <div className="lf-section-head lf-section-head--center">
          <h2 className="lf-display-s" style={{ fontSize: 'var(--text-display-s)' }} data-motion="head">{t.tour.title}</h2>
          <p className="lf-lede mt-3">{t.tour.subtitle}</p>
        </div>
        <div className="lf-tour-stage">
          <figure className="lf-tour-frame lf-tour-frame--aux lf-tour-frame--aux-a" data-motion="aux-a">
            <Image src={scheduleScreenshot} alt={t.tour.schedule} width={2880} height={1800} sizes="46vw" />
          </figure>
          <figure className="lf-tour-frame lf-tour-frame--aux lf-tour-frame--aux-b" data-motion="aux-b">
            <Image src={casesScreenshot} alt={t.tour.cases} width={2880} height={1800} sizes="46vw" />
          </figure>
          <figure className="lf-tour-frame lf-tour-frame--main" data-motion="tour-main">
            <Image
              src={dashboardScreenshot}
              alt={t.tour.dashboard}
              width={2880}
              height={1800}
              sizes="(min-width: 60rem) 56rem, 100vw"
              priority={false}
            />
          </figure>
        </div>
        </div>
      </section>

      {/* Problems + features — one Bento block: pain points as small tiles, product tiles as the anchors */}
      <section id="features" className="lf-section">
        <div className="lf-shell">
          <div className="lf-section-head lf-section-head--center">
            <h2 className="lf-display-s" style={{ fontSize: 'var(--text-display-s)' }} data-motion="head">{t.features.title}</h2>
            <p className="lf-lede mt-3">{t.features.subtitle}</p>
          </div>

          <div className="lf-bento mt-10 sm:mt-14">
            {t.features.items.map((feature, i) => {
              return (
                <article key={feature.title} className={i === 0 ? 'lf-tile lf-tile--lead' : 'lf-tile'} data-motion="tile">
                  <div>
                    <h3
                      className={i === 0 ? 'lf-display-s text-xl sm:text-2xl' : 'text-lg font-semibold'}
                      style={{ color: 'var(--color-ink)' }}
                    >
                      {feature.title}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
                      {feature.description}
                    </p>
                  </div>
                  {i === 0 ? (
                    <ul className="space-y-2.5">
                      {feature.highlights.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 rounded-lg border p-3 text-sm font-medium"
                          style={{ borderColor: 'var(--color-accent-line)', background: 'var(--color-paper-3)', color: 'var(--color-ink)' }}
                        >
                          <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-success)' }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {feature.highlights.map((item) => (
                        <li
                          key={item}
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
                          style={{ background: 'var(--color-paper-2)', color: 'var(--color-ink-2)' }}
                        >
                          <Check className="h-3 w-3" style={{ color: 'var(--color-success)' }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}

          </div>
        </div>
      </section>

      <PricingSection />

      {/* CTA — one visual anchor (trial), one supporting link (demo) */}
      <section
        id="trial"
        className="lf-section lf-snap"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        <div className="lf-shell text-center">
          <h2 className="lf-display-s" style={{ fontSize: 'var(--text-display-s)' }} data-motion="cta">{t.cta.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base" style={{ color: 'oklch(99% 0 0 / 0.85)' }}>
            {t.cta.subtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-semibold" style={{ color: 'oklch(99% 0 0 / 0.7)' }}>
              {t.audience.title}
            </span>
            {t.audience.items.map((item) => (
              <span key={item} className="lf-chip lf-chip--on-accent !py-1.5 !text-xs">
                {item}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/register" className="lf-btn lf-btn--on-accent w-full sm:w-auto">
              {t.cta.tryFree}
            </Link>
            <a href={demoHref} onClick={() => fbTrack('Lead')} className="lf-btn lf-btn--ghost-on-accent w-full sm:w-auto">
              {t.cta.demo}
            </a>
          </div>
        </div>
      </section>

      {/* Footer — Ft2 inline single line */}
      <footer className="border-t" style={{ borderColor: 'var(--color-rule)' }}>
        <div className="lf-shell flex flex-col items-center justify-between gap-3 py-8 text-center sm:flex-row sm:text-left">
          <Link href="/" aria-label="Samnuan" className="flex min-h-11 items-center gap-2">
            <SamnuanLogo
              variant="horizontal"
              className="text-[var(--color-brand)]"
              markClassName="h-8 w-8"
              wordmarkClassName="text-sm"
            />
          </Link>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }}>
            {t.footer}
          </p>
          <nav className="flex flex-wrap justify-center gap-x-4 text-xs" aria-label={t.legal.label}>
            <Link href="/privacy" className="lf-link inline-flex min-h-11 items-center">{t.legal.privacy}</Link>
            <Link href="/delete-account" className="lf-link inline-flex min-h-11 items-center">{t.legal.deleteAccount}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
