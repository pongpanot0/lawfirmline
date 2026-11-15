import { PLAN_CONFIG, SELLABLE_PLANS, SubscriptionPlan } from '@lawfirm/shared';
import { demoHref } from '@/components/landing/contact';
import { siteUrl } from '@/lib/seo';
import type { Lang } from './i18n';

export const thaiHomeDescription =
  'รวมข้อมูลคดี เอกสาร และตารางนัดไว้ในที่เดียว ให้ทีมติดตามงานร่วมกัน พร้อมช่องทางให้ลูกความตรวจสอบความคืบหน้าได้ด้วยตนเอง';
export const englishHomeDescription =
  'Open case files, book court dates, assign team work, update clients and send invoices in one system designed for Thai courts and Thai law.';

export function homeStructuredData(lang: Lang) {
  const description = lang === 'th' ? thaiHomeDescription : englishHomeDescription;
  return {
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
        // Add iOS/Android once the store listings are live and linked from the site.
        operatingSystem: 'Web',
        inLanguage: lang,
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
}
