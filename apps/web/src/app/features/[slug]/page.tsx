import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pages, stages } from '@/lib/marketing/features';
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

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() {
  return stages.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const stage = stages.find((s) => s.slug === slug);
  if (!stage) return {};
  const page = pages[stage.key];
  const title = `${page.h1.replace(/\|/g, ' ')} | Samnuan`;
  const description = page.lead;
  return {
    title,
    description,
    alternates: { canonical: `/features/${slug}` },
    // Child openGraph/twitter replace the root layout's objects wholesale, so repeat the shared fields.
    openGraph: {
      title,
      description,
      url: `/features/${slug}`,
      siteName: 'Samnuan',
      locale: 'th_TH',
      type: 'website',
      images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
  };
}
export default async function FeaturePage({ params }: Props) {
  const { slug } = await params;
  const stage = stages.find((s) => s.slug === slug);
  if (!stage) notFound();
  const page = pages[stage.key];
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'หน้าแรก', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'ฟีเจอร์', item: `${siteUrl}/#features` },
      { '@type': 'ListItem', position: 3, name: page.crumb, item: `${siteUrl}/features/${slug}` },
    ],
  };
  return (
    <div className="mk font-sans antialiased">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structured) }} />
      <MarketingNav active="features" />
      <main>
        <nav aria-label="breadcrumb" className="mx-auto max-w-[1240px] px-4 pt-6 text-sm text-mk-ink-2 md:px-6">
          <a href="/" className="hover:text-mk-ink">
            หน้าแรก
          </a>{' '}
          /{' '}
          <a href="/#features" className="hover:text-mk-ink">
            ฟีเจอร์
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
                ทดลองใช้ฟรี 30 วัน
              </a>
              <a
                href="/pricing"
                className="whitespace-nowrap rounded-lg border border-mk-ink px-6 py-3 font-medium text-mk-ink hover:bg-mk-surface"
              >
                ดูราคา
              </a>
            </div>
            {page.plan && <p className="mt-4 text-sm text-mk-ink-2">{page.plan}</p>}
          </div>
          <figure className="rise min-w-0 lg:col-span-6">
            <div className="tour-stage rounded-xl border border-mk-rule bg-mk-surface p-5 md:p-7">
              <div className="tour-panel is-on">
                <CountUp>
                  <AppPanel stage={stage.key} />
                </CountUp>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-mk-ink-2">ตัวอย่างหน้าจอ · ข้อมูลสมมติ</figcaption>
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
            <CourtFeeEstimator />
          </Reveal>
        )}
        <section className="mx-auto max-w-[1240px] px-4 py-24 md:px-6">
          <Reveal>
            <div className="mb-12 text-center">
              <h2 className="font-display text-3xl font-semibold md:text-4xl">เชื่อมกับทุกขั้นตอนของคดี</h2>
              <p className="mt-3 text-mk-ink-2">ข้อมูลส่งต่อกันทั้งระบบ คลิกดูขั้นตอนอื่นได้</p>
            </div>
          </Reveal>
          <Reveal>
            <CaseTour active={stage.key} autoplay={false} />
          </Reveal>
        </section>
        <Reveal>
          <section className="mx-auto max-w-[860px] px-4">
            <h2 className="mb-6 text-center font-display text-3xl font-semibold">คำถามที่พบบ่อย</h2>
            <FaqList items={page.faq} />
          </section>
        </Reveal>
        <CtaBand title={page.cta} />
      </main>
      <MarketingFooter />
    </div>
  );
}
