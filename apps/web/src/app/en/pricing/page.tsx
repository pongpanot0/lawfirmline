import type { Metadata } from 'next';
import { alternates } from '@/lib/marketing/i18n';
import { PricingPageView } from '@/components/marketing/PricingPageView';

const title = 'Case management pricing for law firms | Samnuan';
const description =
  'Pricing in baht by team size, with a free plan. Every plan has a 30-day free trial with no credit card and no setup fee.';
export const metadata: Metadata = {
  title,
  description,
  alternates: alternates('/en/pricing'),
  openGraph: {
    title,
    description,
    url: '/en/pricing',
    siteName: 'Samnuan',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};
export default function EnglishPricingPage() {
  return <PricingPageView lang="en" />;
}
