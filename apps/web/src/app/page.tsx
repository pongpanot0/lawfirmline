import type { Metadata } from 'next';
import { MarketingHome } from '@/components/marketing/MarketingHome';
import { serializeJsonLd } from '@/lib/seo';
import { alternates } from '@/lib/marketing/i18n';
import { homeStructuredData, thaiHomeDescription } from '@/lib/marketing/structured-data';

const description = thaiHomeDescription;

export const metadata: Metadata = {
  title: 'โปรแกรมจัดการคดีสำหรับสำนักงานกฎหมาย | Samnuan',
  description,
  alternates: alternates('/'),
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeStructuredData('th')) }}
      />
      <MarketingHome lang="th" />
    </>
  );
}
