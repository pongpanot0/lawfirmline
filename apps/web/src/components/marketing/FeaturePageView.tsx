import { getPage, getStages } from '@/lib/marketing/features';
import { localePath, type Lang } from '@/lib/marketing/i18n';
import { serializeJsonLd, siteUrl } from '@/lib/seo';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CtaBand } from '@/components/marketing/CtaBand';
import { AppPanel } from '@/components/marketing/AppPanels';
import { CaseTour } from '@/components/marketing/CaseTour';
import { Reveal } from '@/components/marketing/Reveal';
import { CountUp } from '@/components/marketing/CountUp';
import { CourtFeeEstimator } from '@/components/marketing/CourtFeeEstimator';
import { FaqList } from '@/components/marketing/FaqList';
import { BalancedHeading } from '@/components/marketing/BalancedHeading';
import '@/components/marketing/marketing.css';

export function FeaturePageView({ lang, slug }: { lang: Lang; slug: string }) {
  const stage = getStages(lang).find((s) => s.slug === slug)!;
  const page = getPage(lang, stage.key);
  const home = localePath(lang, '/');
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: lang === 'th' ? 'หน้าแรก' : 'Home',
        item: lang === 'th' ? siteUrl : `${siteUrl}${home}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: lang === 'th' ? 'ฟีเจอร์' : 'Features',
        item: lang === 'th' ? `${siteUrl}/#features` : `${siteUrl}${home}#features`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: page.crumb,
        item: `${siteUrl}${localePath(lang, `/features/${slug}`)}`,
      },
    ],
  };
  return (
    <div className="mk font-sans antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structured) }} />
      <MarketingNav active="features" lang={lang} path={`/features/${slug}`} />
      <main>
        <nav aria-label="breadcrumb" className="mx-auto max-w-[1240px] px-4 pt-6 text-sm text-mk-ink-2 md:px-6">
          <a href={home} className="hover:text-mk-ink">
            {lang === 'th' ? 'หน้าแรก' : 'Home'}
          </a>{' '}
          /{' '}
          <a href={localePath(lang, '/#features')} className="hover:text-mk-ink">
            {lang === 'th' ? 'ฟีเจอร์' : 'Features'}
          </a>{' '}
          / <span>{page.crumb}</span>
        </nav>
        <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 pb-10 pt-10 md:px-6 md:pt-16 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <h1 className="font-display text-[2.1rem] font-semibold leading-[1.3] md:text-[2.9rem] md:leading-[1.25]">
              <BalancedHeading text={page.h1} />
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-mk-ink-2">{page.lead}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/register"
                className="btn-primary whitespace-nowrap rounded-lg bg-mk-ink px-6 py-3 font-medium text-mk-paper"
              >
                {lang === 'th' ? 'ทดลองใช้ฟรี 30 วัน' : 'Start 30-day free trial'}
              </a>
              <a
                href={localePath(lang, '/pricing')}
                className="whitespace-nowrap rounded-lg border border-mk-ink px-6 py-3 font-medium text-mk-ink hover:bg-mk-surface"
              >
                {lang === 'th' ? 'ดูราคา' : 'See pricing'}
              </a>
            </div>
            {page.plan && <p className="mt-4 text-sm text-mk-ink-2">{page.plan}</p>}
          </div>
          <figure className="rise min-w-0 lg:col-span-6">
            <div className="tour-stage rounded-xl border border-mk-rule bg-mk-surface p-5 md:p-7">
              <div className="tour-panel is-on">
                <CountUp>
                  <AppPanel stage={stage.key} lang={lang} />
                </CountUp>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-mk-ink-2">
              {lang === 'th' ? 'ตัวอย่างหน้าจอ · ข้อมูลสมมติ' : 'Sample screen · fictional data'}
            </figcaption>
          </figure>
        </section>
        <Reveal>
          <section className="mx-auto max-w-[900px] px-4 py-16 text-center">
            <p className="font-display text-2xl leading-relaxed text-mk-ink md:text-3xl">&quot;{page.quote}&quot;</p>
          </section>
        </Reveal>
        <section className="mx-auto max-w-[1240px] px-4 md:px-6">
          <div className="divide-y divide-mk-rule border-y border-mk-rule">
            {page.details.map(([title, body]) => (
              <Reveal key={title}>
                <div className="grid gap-3 py-8 md:grid-cols-12">
                  <h3 className="font-display text-xl font-semibold md:col-span-4">{title}</h3>
                  <p className="leading-relaxed text-mk-ink-2 md:col-span-8">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
          {page.note && <p className="mt-4 text-sm text-mk-ink-2">{page.note}</p>}
        </section>
        {page.calculator && (
          <Reveal>
            <CourtFeeEstimator lang={lang} />
          </Reveal>
        )}
        <section className="mx-auto max-w-[1240px] px-4 py-24 md:px-6">
          <Reveal>
            <div className="mb-12 text-center">
              <h2 className="font-display text-3xl font-semibold md:text-4xl">
                {lang === 'th' ? 'เชื่อมกับทุกขั้นตอนของคดี' : 'Connected to every stage of the case'}
              </h2>
              <p className="mt-3 text-mk-ink-2">
                {lang === 'th'
                  ? 'ข้อมูลส่งต่อกันทั้งระบบ คลิกดูขั้นตอนอื่นได้'
                  : 'Data flows across the whole system. Click to see the other stages.'}
              </p>
            </div>
          </Reveal>
          <Reveal>
            <CaseTour active={stage.key} autoplay={false} lang={lang} />
          </Reveal>
        </section>
        <Reveal>
          <section className="mx-auto max-w-[860px] px-4">
            <h2 className="mb-6 text-center font-display text-3xl font-semibold">
              {lang === 'th' ? 'คำถามที่พบบ่อย' : 'Frequently asked questions'}
            </h2>
            <FaqList items={page.faq} lang={lang} />
          </section>
        </Reveal>
        <CtaBand title={page.cta} lang={lang} />
      </main>
      <MarketingFooter lang={lang} />
    </div>
  );
}
