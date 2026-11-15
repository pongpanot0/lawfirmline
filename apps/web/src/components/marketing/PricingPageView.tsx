import type { Lang } from '@/lib/marketing/i18n';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { MarketingPricing } from '@/components/marketing/MarketingPricing';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { CtaBand } from '@/components/marketing/CtaBand';
import { FaqList } from '@/components/marketing/FaqList';
import '@/components/marketing/marketing.css';

// Facts only from docs/seo/2026-11-15-landing-pages-fact-sheet.md and PLAN_CONFIG.
const FAQ: [string, string][] = [
  ['ทดลองใช้ฟรีแล้วต้องใส่บัตรเครดิตไหม', 'ไม่ต้อง ทดลองใช้ได้ 30 วันโดยไม่ต้องใช้บัตรเครดิต และไม่มีค่าติดตั้ง'],
  ['ลูกความที่เข้าพอร์ทัลนับเป็นผู้ใช้ไหม', 'ไม่นับ ลูกความที่เข้าดูพอร์ทัลลูกความไม่นับเป็นผู้ใช้ของแพ็กเกจ'],
  ['จ่ายรายปีได้ส่วนลดไหม', 'ได้ จ่ายรายปีเท่ากับจ่าย 10 เดือน หรือฟรี 2 เดือน'],
];

const EN_FAQ: [string, string][] = [
  ['Do I need a credit card for the free trial?', 'No. Try it for 30 days with no credit card and no setup fee.'],
  [
    'Do clients using the portal count as users?',
    "No. Clients who view the client portal don't count towards your plan's users.",
  ],
  [
    'Is there a discount for paying yearly?',
    'Yes. Paying yearly costs the same as 10 months, so you get 2 months free.',
  ],
];

export function PricingPageView({ lang }: { lang: Lang }) {
  return (
    <div className="mk font-sans antialiased">
      <MarketingNav active="pricing" lang={lang} path="/pricing" />
      <main>
        <section className="mx-auto max-w-3xl px-4 pt-16 text-center md:pt-20">
          <h1 className="font-display text-[2.4rem] font-semibold leading-[1.25] md:text-5xl">
            <span className="inline-block max-w-full">
              {lang === 'th' ? 'ราคาโปรแกรมจัดการคดี' : 'Case management pricing,'}
            </span>{' '}
            <span className="inline-block max-w-full">
              {lang === 'th' ? 'คิดเป็นบาท ตามขนาดทีม' : 'in baht, by team size'}
            </span>
          </h1>
        </section>
        <MarketingPricing lang={lang} />
        <section className="mx-auto max-w-[860px] px-4 pb-8">
          <h2 className="mb-6 text-center font-display text-3xl font-semibold">
            {lang === 'th' ? 'คำถามเรื่องราคา' : 'Pricing questions'}
          </h2>
          <FaqList items={lang === 'th' ? FAQ : EN_FAQ} lang={lang} />
        </section>
        <CtaBand title={lang === 'th' ? 'เริ่มทดลองใช้ฟรี 30 วัน' : 'Start your 30-day free trial'} lang={lang} />
      </main>
      <MarketingFooter lang={lang} />
    </div>
  );
}
