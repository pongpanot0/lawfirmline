'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  PhoneOff,
  FolderOpen,
  CalendarX,
  UserX,
  MessageCircle,
  Briefcase,
  Calendar,
  Users,
  Bell,
  Check,
  ArrowRight,
} from 'lucide-react';
import { useLocale } from './LocaleProvider';
import { LandingNavbar } from './LandingNavbar';
import { PricingSection } from './PricingSection';
import { useLandingMotion } from './useLandingMotion';
import './landing-tokens.css';

const problemIcons = [PhoneOff, FolderOpen, CalendarX, UserX, MessageCircle];
const featureIcons = [Briefcase, Calendar, Users, Bell];
const featureSpans = ['lf-tile--anchor', 'lf-tile--wide', 'lf-tile--wide', 'lf-tile--full'];

export function LandingPage() {
  const { t } = useLocale();
  const scope = useLandingMotion();

  return (
    <div className="lf-landing" ref={scope}>
      <LandingNavbar />

      {/* Hero — H2 split diptych: title/CTA left, illustrative notification stack right */}
      <section className="lf-shell lf-section lf-snap">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <span className="lf-eyebrow" data-motion="hero-eyebrow">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50"
                  style={{ background: 'var(--color-accent)' }}
                />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-accent)' }} />
              </span>
              {t.hero.badge}
            </span>
            <h1
              className="lf-display mt-4 text-[2.25rem] sm:text-[2.75rem] md:text-[3.25rem]"
              style={{ fontSize: 'var(--text-display)' }}
              data-motion="hero-title"
            >
              {t.hero.title}
              <span className="block" style={{ color: 'var(--color-accent)' }}>
                {t.hero.titleHighlight}
              </span>
            </h1>
            <p className="lf-lede mt-5 max-w-lg text-base sm:text-lg" data-motion="hero-subtitle">
              {t.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" data-motion="hero-cta">
              <Link href="/login" className="lf-btn lf-btn--primary w-full sm:w-auto">
                {t.hero.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#trial" className="lf-btn lf-btn--outline w-full sm:w-auto">
                {t.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-4 text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }} data-motion="hero-note">
              {t.hero.note}
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="relative mx-auto max-w-sm" data-motion="hero-card">
              <div
                className="absolute -right-3 top-6 w-full rotate-3 rounded-2xl border opacity-70 sm:-right-4"
                style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-2)', aspectRatio: '4 / 3' }}
                aria-hidden
              />
              <div
                className="relative rounded-2xl border p-5"
                style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)', boxShadow: '0 8px 24px oklch(23% 0.02 40 / 0.08)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ink-2)' }}>
                  {t.features.items[0].title}
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    { icon: Calendar, label: t.features.items[1].highlights[0] },
                    { icon: MessageCircle, label: t.features.items[2].highlights[0] },
                    { icon: Bell, label: t.features.items[3].highlights[0] },
                  ].map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 rounded-xl border p-3"
                      style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper)' }}
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product tour — the real app, not a mockup. GSAP converges the two supporting
          screens onto the main dashboard shot as this section enters the viewport. */}
      <section className="lf-shell lf-snap">
        <div className="lf-section-head lf-section-head--center">
          <h2 className="lf-display-s text-2xl sm:text-3xl">{t.tour.title}</h2>
          <p className="lf-lede mt-3">{t.tour.subtitle}</p>
        </div>
        <div className="lf-tour-stage" data-motion="tour-stage">
          <figure className="lf-tour-frame lf-tour-frame--aux lf-tour-frame--aux-a" data-motion="tour-aux-a">
            <Image src="/marketing/court-schedule.png" alt={t.tour.schedule} width={2880} height={1800} sizes="46vw" />
          </figure>
          <figure className="lf-tour-frame lf-tour-frame--aux lf-tour-frame--aux-b" data-motion="tour-aux-b">
            <Image src="/marketing/cases-list.png" alt={t.tour.cases} width={2880} height={1800} sizes="46vw" />
          </figure>
          <figure className="lf-tour-frame lf-tour-frame--main" data-motion="tour-main">
            <Image
              src="/marketing/dashboard.png"
              alt={t.tour.dashboard}
              width={2880}
              height={1800}
              sizes="(min-width: 60rem) 56rem, 100vw"
              priority={false}
            />
          </figure>
        </div>
      </section>

      {/* Problems + features — one Bento block: pain points as small tiles, product tiles as the anchors */}
      <section id="features" className="lf-section lf-section--paper2 lf-snap-tall">
        <div className="lf-shell">
          <div className="lf-section-head lf-section-head--center">
            <h2 className="lf-display-s text-2xl sm:text-3xl">{t.features.title}</h2>
            <p className="lf-lede mt-3">{t.features.subtitle}</p>
          </div>

          <div className="lf-bento mt-10 sm:mt-14">
            {t.features.items.map((feature, i) => {
              const Icon = featureIcons[i];
              return (
                <article
                  key={feature.title}
                  className={`lf-tile lf-tile--feature ${featureSpans[i]}`}
                  data-motion="bento-tile"
                >
                  <span className="lf-tile-icon">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
                    {feature.description}
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {feature.highlights.map((item) => (
                      <li
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{ background: 'var(--color-paper-3)', color: 'var(--color-ink-2)' }}
                      >
                        <Check className="h-3 w-3" style={{ color: 'var(--color-success)' }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}

            <div className="lf-tile--full">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ink-2)' }}>
                {t.problems.title}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {t.problems.items.map((text, i) => {
                  const Icon = problemIcons[i];
                  return (
                    <div key={text} className="lf-tile !p-4" data-motion="bento-tile">
                      <span className="lf-tile-icon !h-8 !w-8">
                        <Icon className="h-4 w-4" />
                      </span>
                      <p className="mt-3 text-sm font-medium leading-snug" style={{ color: 'var(--color-ink)' }}>
                        {text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audience — hairline chip row */}
      <section className="lf-section--tight lf-snap">
        <div className="lf-shell text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-ink-2)' }}>
            {t.audience.title}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {t.audience.items.map((item) => (
              <span key={item} className="lf-chip">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PricingSection />

      {/* CTA — one visual anchor (trial), one supporting link (demo) */}
      <section
        id="trial"
        className="lf-section--tight lf-snap"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        <div className="lf-shell text-center">
          <h2 className="lf-display-s text-2xl sm:text-3xl">{t.cta.title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base" style={{ color: 'oklch(99% 0 0 / 0.85)' }}>
            {t.cta.subtitle}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/login" className="lf-btn lf-btn--on-accent w-full sm:w-auto">
              {t.cta.tryFree}
            </Link>
            <a
              href={`mailto:hello@samnuan.co?subject=${encodeURIComponent(t.cta.demoSubject)}`}
              className="text-sm font-medium underline underline-offset-4"
              style={{ color: 'oklch(99% 0 0 / 0.9)' }}
            >
              {t.cta.demo}
            </a>
          </div>
        </div>
      </section>

      {/* Footer — Ft2 inline single line */}
      <footer className="border-t" style={{ borderColor: 'var(--color-rule)' }}>
        <div className="lf-shell flex flex-col items-center justify-between gap-3 py-8 text-center sm:flex-row sm:text-left">
          <Link href="/" className="flex items-center gap-2">
            <img src="/brand/samnuan-icon.png" alt="" className="h-7 w-7 rounded-full object-contain" />
            <span className="lf-display text-sm">Samnuan</span>
          </Link>
          <p className="text-xs sm:text-sm" style={{ color: 'var(--color-ink-2)' }}>
            {t.footer}
          </p>
        </div>
      </footer>
    </div>
  );
}
