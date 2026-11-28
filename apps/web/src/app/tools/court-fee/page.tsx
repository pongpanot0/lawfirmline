import type { Metadata } from 'next';
import { Calculator, FileText, FolderCheck } from 'lucide-react';
import { CourtFeeTool } from '@/components/marketing/CourtFeeTool';
import { CtaBand } from '@/components/marketing/CtaBand';
import { FaqList } from '@/components/marketing/FaqList';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import '@/components/marketing/marketing.css';

const title = 'คำนวณค่าขึ้นศาลและค่าบังคับคดี ฟรี | Samnuan';
const description =
  'คำนวณค่าขึ้นศาลคดีแพ่ง มโนสาเร่ อุทธรณ์ ฎีกา และค่าธรรมเนียมบังคับคดีอัตราใหม่ 2568 พร้อมวิธีคิดทีละขั้น ใช้ฟรี ไม่ต้องสมัคร';
const path = '/tools/court-fee';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: path },
  openGraph: {
    title,
    description,
    url: path,
    siteName: 'Samnuan',
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/marketing/og.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};

const faq: [string, string][] = [
  [
    'ค่าขึ้นศาลคดีแพ่งคิดอย่างไร',
    'คิดร้อยละ 2 ของทุนทรัพย์ส่วนที่ไม่เกิน 50 ล้านบาท แต่ส่วนนี้ไม่เกิน 200,000 บาท แล้วบวกร้อยละ 0.1 ของส่วนที่เกิน 50 ล้านบาท เศษสตางค์ปัดทิ้ง',
  ],
  [
    'อุทธรณ์หรือฎีกาต้องเสียค่าขึ้นศาลอีกไหม',
    'ต้องเสียใหม่ โดยคิดจากทุนทรัพย์ที่ยังพิพาทในชั้นนั้น ไม่ใช่ทุนทรัพย์เดิมทั้งหมด (ป.วิ.พ. มาตรา 150)',
  ],
  [
    'คดีผู้บริโภคและคดีแรงงานเสียค่าขึ้นศาลไหม',
    'ผู้บริโภคที่ฟ้องคดีและคดีแรงงานได้รับยกเว้นค่าธรรมเนียม แต่ศาลอาจสั่งให้ชำระภายหลังได้ในบางกรณี',
  ],
  [
    'ค่าบังคับคดีเปลี่ยนเมื่อไร',
    'ตั้งแต่ 10 ก.ย. 2568 ค่าธรรมเนียมขายทอดตลาดเหลือร้อยละ 2 และการจ่ายเงินที่ยึดหรืออายัดเหลือร้อยละ 1',
  ],
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(([name, text]) => ({
    '@type': 'Question',
    name,
    acceptedAnswer: { '@type': 'Answer', text },
  })),
};

const benefits = [
  [Calculator, 'เลือกประเภทคดีและใส่ทุนทรัพย์ ระบบใส่ค่าขึ้นศาลให้ทันที'],
  [FolderCheck, 'ทนายตรวจยอดก่อนบันทึก ทุกยอดผูกกับแฟ้มคดี'],
  [FileText, 'สรุปค่าใช้จ่ายส่งลูกความได้ ไม่ต้องคิดซ้ำในไฟล์ Excel'],
] as const;

const heading = 'font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.32] font-semibold';

export default function CourtFeePage() {
  return (
    <div className="mk font-sans leading-[1.6]">
      <MarketingNav path="/" />
      <main className="mx-auto max-w-[1040px] px-4 md:px-6">
        <nav className="mt-2 text-[13px] text-mk-ink-2 md:mt-4" aria-label="เส้นทางหน้า">
          <ol className="flex flex-wrap items-center gap-2">
            <li><a className="inline-flex min-h-11 items-center hover:underline" href="/">หน้าแรก</a></li>
            <li aria-hidden="true">›</li>
            <li>เครื่องมือฟรี</li>
            <li aria-hidden="true">›</li>
            <li className="inline-flex min-h-11 items-center text-mk-ink" aria-current="page">คำนวณค่าขึ้นศาล</li>
          </ol>
        </nav>
        <div className="mt-2 mb-4 md:mt-4 md:mb-6">
          <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] leading-[1.32] font-semibold">คำนวณค่าขึ้นศาล</h1>
          <p className="mt-2 max-w-[62ch] text-sm leading-[1.6] text-mk-ink-2 md:text-base md:leading-[1.6]">
            ใส่ทุนทรัพย์ เลือกประเภทคดีและชั้นศาล แล้วดูค่าขึ้นศาลพร้อมวิธีคิดทีละขั้น ใช้ฟรี ไม่ต้องสมัคร
          </p>
        </div>

        <CourtFeeTool />

        <section className="mt-12 md:mt-16" aria-labelledby="benefits-title">
          <h2 className={heading} id="benefits-title">ในสำนวน ค่าขึ้นศาลคิดให้ตอนบันทึกค่าใช้จ่ายคดี</h2>
          <ul className="mt-4 grid gap-3">
            {benefits.map(([Icon, text]) => (
              <li key={text} className="flex items-start gap-3">
                <Icon className="mt-1 size-[18px] shrink-0" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 [&_section]:m-0 [&_section]:p-0 [&_section>div]:py-12 md:[&_section>div]:py-14 [&_h2]:text-[clamp(1.5rem,3vw,2.25rem)] [&_h2]:leading-[1.32]">
          <CtaBand title="ให้สำนวนคิดค่าขึ้นศาลในทุกคดีของคุณ" />
        </div>

        <section className="mt-12 pb-12 md:mt-16 md:pb-20" aria-labelledby="faq-title">
          <h2 className={heading} id="faq-title">คำถามที่พบบ่อย</h2>
          <div className="mt-4"><FaqList items={faq} /></div>
        </section>
      </main>

      <MarketingFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }}
      />
    </div>
  );
}
