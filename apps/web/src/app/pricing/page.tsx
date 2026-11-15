import type { Metadata } from 'next';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingPricing } from '@/components/marketing/MarketingPricing';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CtaBand } from '@/components/marketing/CtaBand';
import { FaqList } from '@/components/marketing/FaqList';
import '@/components/marketing/marketing.css';

const title = 'ราคาโปรแกรมจัดการคดี | Samnuan';
const description =
  'ราคาโปรแกรมจัดการคดีสำหรับสำนักงานกฎหมาย คิดเป็นบาทตามขนาดทีม มีแพ็กเกจฟรี ทุกแพ็กเกจทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต และไม่มีค่าติดตั้ง';

// Child openGraph/twitter replace the root layout's objects wholesale, so repeat the shared fields.
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/pricing' },
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

// Facts only from docs/seo/2026-11-15-landing-pages-fact-sheet.md and PLAN_CONFIG.
const FAQ: [string, string][] = [
  ['ทดลองใช้ฟรีแล้วต้องใส่บัตรเครดิตไหม', 'ไม่ต้อง ทดลองใช้ได้ 30 วันโดยไม่ต้องใช้บัตรเครดิต และไม่มีค่าติดตั้ง'],
  ['ลูกความที่เข้าพอร์ทัลนับเป็นผู้ใช้ไหม', 'ไม่นับ ลูกความที่เข้าดูพอร์ทัลลูกความไม่นับเป็นผู้ใช้ของแพ็กเกจ'],
  ['จ่ายรายปีได้ส่วนลดไหม', 'ได้ จ่ายรายปีเท่ากับจ่าย 10 เดือน หรือฟรี 2 เดือน'],
];

export default function PricingPage() {
  return (
    <div className="mk font-sans antialiased">
      <MarketingNav active="pricing" />
      <main>
        <section className="mx-auto max-w-3xl px-4 pt-16 text-center md:pt-20">
          <h1 className="font-display text-[2.4rem] font-semibold leading-[1.25] md:text-5xl">
            <span className="inline-block max-w-full">ราคาโปรแกรมจัดการคดี</span>{' '}
            <span className="inline-block max-w-full">คิดเป็นบาท ตามขนาดทีม</span>
          </h1>
        </section>
        <MarketingPricing />
        <section className="mx-auto max-w-[860px] px-4 pb-8">
          <h2 className="mb-6 text-center font-display text-3xl font-semibold">คำถามเรื่องราคา</h2>
          <FaqList items={FAQ} />
        </section>
        <CtaBand title="เริ่มทดลองใช้ฟรี 30 วัน" />
      </main>
      <MarketingFooter />
    </div>
  );
}
