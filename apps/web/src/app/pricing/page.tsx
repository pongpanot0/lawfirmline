import type { Metadata } from 'next';
import { alternates } from '@/lib/marketing/i18n';
import { PricingPageView } from '@/components/marketing/PricingPageView';

const title = 'ราคาโปรแกรมจัดการคดี | Samnuan';
const description =
  'ราคาโปรแกรมจัดการคดีสำหรับสำนักงานกฎหมาย คิดเป็นบาทตามขนาดทีม มีแพ็กเกจฟรี ทุกแพ็กเกจทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต และไม่มีค่าติดตั้ง';

// Child openGraph/twitter replace the root layout's objects wholesale, so repeat the shared fields.
export const metadata: Metadata = {
  title,
  description,
  alternates: alternates('/pricing'),
  openGraph: {
    title,
    description,
    url: '/pricing',
    siteName: 'Samnuan',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};

export default function PricingPage() {
  return <PricingPageView lang="th" />;
}
