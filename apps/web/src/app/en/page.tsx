import type { Metadata } from 'next';
import { MarketingHome } from '@/components/marketing/MarketingHome';
import { alternates } from '@/lib/marketing/i18n';
import { englishHomeDescription as description, homeStructuredData } from '@/lib/marketing/structured-data';
import { serializeJsonLd } from '@/lib/seo';

const title = 'Case management software for Thai law firms | Samnuan';
export const metadata: Metadata = {
  title,
  description,
  alternates: alternates('/en'),
  openGraph: {
    title,
    description,
    url: '/en',
    siteName: 'Samnuan',
    locale: 'en_US',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};

export default function EnglishHomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeStructuredData('en')) }}
      />
      <MarketingHome lang="en" />
    </>
  );
}
