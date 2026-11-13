'use client';

import Link from 'next/link';
import { PLAN_CONFIG, SubscriptionPlan } from '@lawfirm/shared';
import Image from 'next/image';
import { ArrowDown, ArrowRight, CalendarDays, Clock3, Files, Layers3, MessageCircle, Orbit } from 'lucide-react';
import dashboardScreenshot from '../../../public/marketing/dashboard.png';
import casesScreenshot from '../../../public/marketing/cases-list.png';
import scheduleScreenshot from '../../../public/marketing/court-schedule.png';
import { SamnuanLogo } from '@/components/brand/SamnuanLogo';
import { useLocale } from './LocaleProvider';
import { LandingNavbar } from './LandingNavbar';
import { PricingSection } from './PricingSection';
import { useLandingMotion } from './useLandingMotion';
import './landing-tokens.css';

const icons = [Layers3, CalendarDays, Files, Orbit, MessageCircle];

export function LandingPage() {
  const { t, locale } = useLocale();
  const scope = useLandingMotion();
  const shots = [
    { image: dashboardScreenshot, label: t.tour.dashboard },
    { image: casesScreenshot, label: t.tour.cases },
    { image: scheduleScreenshot, label: t.tour.schedule },
  ];

  return (
    <div className="samnuan-paper lf-landing" ref={scope}>
      <div className="tech-progress" aria-hidden="true" />
      <LandingNavbar />
      <nav className="tech-section-nav" aria-label={locale === 'th' ? 'ส่วนต่าง ๆ ของหน้า' : 'Page sections'}>
        {[
          ['hero', locale === 'th' ? 'หน้าหลัก' : 'Home'],
          ['tour', t.tour.title],
          ['problems', t.problems.title],
          ['features', t.nav.features],
          ['pricing', t.nav.pricing],
          ['trial', t.nav.trial],
        ].map(([id, label], i) => <a key={id} href={`#${id}`} aria-label={`${String(i + 1).padStart(2, '0')} / 06 — ${label}`}><span /></a>)}
      </nav>
      <main>
        <section id="hero" data-section className="tech-hero">
          <div className="tech-grid" aria-hidden="true" /><div className="tech-aurora" aria-hidden="true" />
          <div className="lf-shell tech-hero-inner">
            <div className="tech-hero-copy">
              <p className="tech-eyebrow" data-hero><span className="tech-dot" /> {t.hero.category}</p>
              <h1 className="tech-title"><span className="tech-title-mask"><span data-title>{t.hero.title}</span></span><span className="tech-title-mask"><span data-title>{t.hero.titleHighlight}</span></span></h1>
              <p className="tech-lede" data-hero>{t.hero.subtitle}</p>
              <div className="tech-actions" data-hero>
                <Link href="/register" className="lf-btn lf-btn--primary">{t.hero.ctaPrimary}<ArrowRight size={17} aria-hidden /></Link>
              </div>
              <p className="tech-note" data-hero>{t.hero.note}<br />{t.hero.starting.replace('{price}', PLAN_CONFIG[SubscriptionPlan.TEAM].priceThb.toLocaleString()).replace('{count}', String(PLAN_CONFIG[SubscriptionPlan.TEAM].maxUsers))}</p>
            </div>
            <div className="tech-hero-depth" data-hero-visual>
            <div className="tech-hero-visual">
              <span className="tech-sheen" aria-hidden="true" /><div className="tech-window-bar"><span /><span /><span /><b> SAMNUAN / WORKSPACE</b></div>
              <Image src={dashboardScreenshot} alt={t.tour.dashboard} priority sizes="(min-width: 900px) 55vw, 100vw" />
              <div className="tech-visual-label"><span className="tech-dot" /> {t.tour.dashboard}</div>
            </div>
            <div className="tech-chip tech-chip--hero" aria-hidden="true"><CalendarDays size={16} /> {locale === 'th' ? 'นัดศาลพรุ่งนี้ 09:00' : 'Court tomorrow · 09:00'}</div>
            </div>
            <a className="tech-scroll" href="#tour"><ArrowDown size={16} aria-hidden /> {locale === 'th' ? 'สำรวจระบบ' : 'EXPLORE THE PLATFORM'}</a>
          </div>
        </section>
        <div className="tech-strip" aria-label={t.features.title}>
          <div className="tech-strip-track">{[0, 1].map(copy => <div className="tech-strip-inner" aria-hidden={copy === 1} key={copy}>{t.features.items.map((item, i) => <span key={item.title}><b>0{i + 1}</b> {item.title}</span>)}</div>)}</div>
        </div>
        <section id="tour" data-section className="tech-tour lf-section">
          <div className="lf-shell">
            <div className="tech-section-intro" data-reveal>
              <p className="tech-eyebrow">01 / {locale === 'th' ? 'ภาพรวมระบบ' : 'THE PLATFORM'}</p>
              <h2>{t.tour.title}</h2><p>{t.tour.subtitle}</p>
            </div>
            <div className="tech-tour-stage">
              <div className="tech-tour-copy"><span className="tech-orbit" aria-hidden="true"><span className="tech-orbit-ring" /><Orbit size={44} /></span><p>{locale === 'th' ? 'จากภาพรวมทีม สู่รายละเอียดคดี และนัดศาล' : 'From your team overview to cases and court dates.'}</p><div className="tech-tour-captions" aria-hidden="true">{shots.map((shot, i) => <span className="tech-tour-caption" key={shot.label}><b>0{i + 1} / 0{shots.length}</b> {shot.label}</span>)}</div><span className="tech-tour-hint">{locale === 'th' ? 'เลื่อนเพื่อสำรวจ' : 'SCROLL TO EXPLORE'} ↓</span></div>
              <div className="tech-tour-depth">
              <div className="tech-shot-tilt"><div className="tech-shot-stack">
                {shots.map((shot, i) => <figure className="tech-shot" data-shot key={shot.label}>
                  <span className="tech-sheen" aria-hidden="true" /><div className="tech-window-bar"><span /><span /><span /><b>0{i + 1} / {shot.label}</b></div>
                  <Image src={shot.image} alt={shot.label} sizes="(min-width: 900px) 55vw, 100vw" />
                </figure>)}
              </div></div>
              <div className="tech-chip tech-chip--one" aria-hidden="true"><CalendarDays size={16} /> {locale === 'th' ? 'นัดศาลพรุ่งนี้ 09:00' : 'Court tomorrow · 09:00'}</div>
              <div className="tech-chip tech-chip--two" aria-hidden="true"><Clock3 size={16} /> {locale === 'th' ? 'งานใกล้ครบกำหนด 1 งาน' : '1 task due soon'}</div>
              </div>
            </div>
          </div>
        </section>
        <section id="problems" data-section className="tech-features lf-section">
          <div className="lf-shell"><div className="tech-section-intro" data-reveal><h2>{t.problems.title}</h2><p>{t.problems.subtitle}</p></div><div className="tech-feature-grid">{t.problems.items.map((item, i) => <article className="tech-feature" key={item} data-reveal><div className="tech-feature-top"><span>0{i + 1}</span></div><h3>{item}</h3></article>)}</div></div>
        </section>
        <section id="features" data-section className="tech-features lf-section">
          <div className="lf-shell">
            <div className="tech-section-intro" data-reveal><p className="tech-eyebrow">02 / {locale === 'th' ? 'เครื่องมือของทีม' : 'YOUR TOOLKIT'}</p><h2>{t.features.title}</h2><p>{t.features.subtitle}</p></div>
            <div className="tech-feature-grid">{t.features.items.map((feature, i) => {
              const Icon = icons[i];
              return <article className="tech-feature" key={feature.title} data-reveal><span className="tech-spotlight" aria-hidden="true" /><div className="tech-feature-top"><Icon size={23} aria-hidden /><span>0{i + 1} / 0{t.features.items.length}</span></div><h3>{feature.title}</h3><p>{feature.description}</p><ul>{feature.highlights.map(item => <li key={item}>{item}</li>)}</ul></article>;
            })}</div>
          </div>
        </section>
        <PricingSection />
        <section id="trial" data-section className="tech-cta lf-section"><div className="lf-shell" data-reveal><p className="tech-eyebrow">03 / {locale === 'th' ? 'เริ่มต้นใช้งาน' : 'GET STARTED'}</p><h2>{t.cta.title}</h2><p>{t.cta.subtitle}</p><div className="tech-actions"><Link href="/register" className="lf-btn lf-btn--primary">{t.cta.tryFree}<ArrowRight size={17} aria-hidden /></Link></div><p className="tech-audience">{t.audience.title} · {t.audience.items.join(' / ')}</p></div></section>
      </main>
      <footer className="tech-footer"><div className="lf-shell"><Link href="/" aria-label="Samnuan"><SamnuanLogo variant="horizontal" className="text-[var(--color-brand)]" markClassName="h-8 w-8" wordmarkClassName="text-sm" /></Link><p>{t.footer}</p><nav aria-label={t.legal.label}><Link href="/privacy">{t.legal.privacy}</Link><Link href="/delete-account">{t.legal.deleteAccount}</Link></nav></div></footer>
    </div>
  );
}
