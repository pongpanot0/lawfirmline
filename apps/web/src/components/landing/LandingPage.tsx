'use client';

import Link from 'next/link';
import Image from 'next/image';
import dashboardScreenshot from '../../../public/marketing/dashboard.png';
import casesScreenshot from '../../../public/marketing/cases-list.png';
import scheduleScreenshot from '../../../public/marketing/court-schedule.png';
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
import { fbTrack } from '@/components/FacebookPixel';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { useLocale } from './LocaleProvider';
import { demoHref } from './contact';
import { LandingNavbar } from './LandingNavbar';
import { PricingSection } from './PricingSection';
import { useLandingMotion } from './useLandingMotion';
import './landing-tokens.css';

const problemIcons = [PhoneOff, FolderOpen, CalendarX, UserX, MessageCircle];
const featureIcons = [Briefcase, Calendar, Users, Bell];
const featureSpans = ['lf-tile--sm', 'lf-tile--sm', 'lf-tile--sm', 'lf-tile--sm'];

export function LandingPage() {
  const { t } = useLocale();
  const scope = useLandingMotion();

  return (
    <div className="samnuan-paper lf-landing" ref={scope}>
      <LandingNavbar />

      {/* Hero — H2 split diptych: title/CTA left, illustrative notification stack right */}
      <section className="lf-shell lf-section lf-snap">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <span className="lf-eyebrow" data-motion="hero-eyebrow">
              {t.hero.badge}
            </span>
            <h1 className="lf-display mt-4" style={{ fontSize: 'var(--text-display)' }}>
              <span className="lf-mask">
                <span data-motion="hero-line">{t.hero.title}</span>
              </span>
              <span className="lf-mask" style={{ color: 'var(--color-accent)' }}>
                <span data-motion="hero-line">{t.hero.titleHighlight}</span>
              </span>
            </h1>
            <p className="lf-lede mt-5 max-w-lg text-base sm:text-lg" data-motion="hero-subtitle">
              {t.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" data-motion="hero-cta">
              <Link href="/register" className="lf-btn lf-btn--primary w-full sm:w-auto">
                {t.hero.ctaPrimary}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={demoHref} onClick={() => fbTrack('Lead')} className="lf-btn lf-btn--outline w-full sm:w-auto">
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
                className="relative rounded-lg border p-6"
                style={{ borderColor: 'var(--color-rule)', background: 'var(--color-paper-3)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-ink-2)' }}>
                  {t.hero.cardTitle}
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    { icon: Calendar, label: t.features.items[1].highlights[0] },
                    { icon: MessageCircle, label: t.features.items[2].highlights[0] },
                    { icon: Bell, label: t.features.items[3].highlights[0] },
                  ].map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="flex items-center gap-3 border-t py-4"
                      style={{ borderColor: 'var(--color-rule)' }}
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

      {/* Product tour — a full-bleed dark act (era DNA). The real app, not a mockup;
          GSAP converges the two supporting screens onto the main dashboard shot. */}
      <section className="lf-section lf-section--dark lf-snap">
        <div className="lf-shell">
        <div className="lf-section-head lf-section-head--center">
          <span className="lf-kicker">The Product</span>
          <h2 className="lf-display-s mt-3" style={{ fontSize: 'var(--text-display-s)' }}>{t.tour.title}</h2>
          <p className="lf-lede mt-3">{t.tour.subtitle}</p>
        </div>
        <div className="lf-tour-stage" data-motion="tour-stage">
          <figure className="lf-tour-frame lf-tour-frame--aux lf-tour-frame--aux-a" data-motion="tour-aux-a">
            <Image src={scheduleScreenshot} alt={t.tour.schedule} width={2880} height={1800} sizes="46vw" />
          </figure>
          <figure className="lf-tour-frame lf-tour-frame--aux lf-tour-frame--aux-b" data-motion="tour-aux-b">
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
      <section id="features" className="lf-section lf-section--paper2">
        <div className="lf-shell">
          <div className="lf-section-head lf-section-head--center">
            <h2 className="lf-display-s" style={{ fontSize: 'var(--text-display-s)' }}>{t.features.title}</h2>
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
                  <div className="flex items-center gap-3">
                    <span className="lf-tile-icon">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
                      {feature.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--color-ink-2)' }}>
                    {feature.description}
                  </p>
                  {i === 0 ? (
                    <ul className="mt-5 space-y-2.5">
                      {feature.highlights.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-3 rounded-xl border p-3 text-sm font-medium"
                          style={{ borderColor: 'var(--color-accent-line)', background: 'var(--color-paper-3)', color: 'var(--color-ink)' }}
                        >
                          <Check className="h-4 w-4 shrink-0" style={{ color: 'var(--color-success)' }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {feature.highlights.map((item) => (
                        <li
                          key={item}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
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

      <PricingSection />

      {/* CTA — one visual anchor (trial), one supporting link (demo) */}
      <section
        id="trial"
        className="lf-section lf-snap"
        style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
      >
        <div className="lf-shell text-center">
          <h2 className="lf-display-s" style={{ fontSize: 'var(--text-display-s)' }}>{t.cta.title}</h2>
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
            <a
              href={demoHref}
              onClick={() => fbTrack('Lead')}
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
          <Link href="/" aria-label="Samnuan" className="flex items-center gap-2">
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
          <nav className="flex flex-wrap justify-center gap-4 text-xs" aria-label="ข้อมูลบัญชี">
            <Link href="/privacy" className="underline underline-offset-4">ความเป็นส่วนตัว</Link>
            <Link href="/delete-account" className="underline underline-offset-4">ขอลบบัญชี</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
