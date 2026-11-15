import type { Metadata } from 'next';
import { PLAN_CONFIG, SELLABLE_PLANS, SubscriptionPlan } from '@lawfirm/shared';
import { MarketingHome } from '@/components/marketing/MarketingHome';
import { demoHref } from '@/components/landing/contact';
import { serializeJsonLd, siteUrl } from '@/lib/seo';

const description =
  'รวมข้อมูลคดี เอกสาร และตารางนัดไว้ในที่เดียว ให้ทีมติดตามงานร่วมกัน พร้อมช่องทางให้ลูกความตรวจสอบความคืบหน้าได้ด้วยตนเอง';

export const metadata: Metadata = {
  title: 'โปรแกรมจัดการคดีสำหรับสำนักงานกฎหมาย | Samnuan',
  description,
  alternates: { canonical: '/' },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Samnuan',
      url: siteUrl,
      logo: `${siteUrl}/brand/samnuan-logo.png`,
      // demoHref is the LINE OA when NEXT_PUBLIC_LINE_OA_URL is set (prod); never list the mailto fallback.
      sameAs: demoHref.startsWith('https://lin.ee/') ? [demoHref] : [],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Samnuan',
      url: siteUrl,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web, iOS, Android',
      inLanguage: 'th',
      description,
      offers: [SubscriptionPlan.FREE, ...SELLABLE_PLANS].map((plan) => ({
        '@type': 'Offer',
        name: PLAN_CONFIG[plan].name,
        price: PLAN_CONFIG[plan].priceThb,
        priceCurrency: 'THB',
        url: `${siteUrl}/register`,
      })),
    },
    { '@type': 'WebSite', name: 'Samnuan', url: siteUrl },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <MarketingHome />
    </>
  );
}
