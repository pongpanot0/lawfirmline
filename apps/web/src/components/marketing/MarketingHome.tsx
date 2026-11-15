import type { Lang } from '@/lib/marketing/i18n';
import { MarketingNav } from './MarketingNav';
import { MarketingFooter } from './MarketingFooter';
import { CtaBand } from './CtaBand';
import { CaseTour } from './CaseTour';
import { Reveal } from './Reveal';
import { BalancedHeading } from './BalancedHeading';
import { MarketingPricing } from './MarketingPricing';
import './marketing.css';

const copy = {
  th: {
    s0: 'โปรแกรมจัดการคดี',
    s1: 'สำหรับสำนักงานกฎหมายไทย',
    s2: 'เปิดสำนวน ลงนัดศาล แบ่งงานในทีม อัปเดตลูกความ และออกใบแจ้งหนี้ ได้ในระบบเดียว ออกแบบมาสำหรับศาลและกฎหมายไทย',
    s3: 'ทดลองใช้ฟรี 30 วัน',
    s4: 'ดูราคา',
    s5: 'ไม่ต้องใช้บัตรเครดิต · ไม่มีค่าติดตั้ง',
    s6: 'ทุกขั้นตอนของคดี|จบในระบบเดียว',
    s7: 'ตั้งแต่วันที่ลูกความมาปรึกษา|จนถึงวันออกใบแจ้งหนี้งวดสุดท้าย',
    s8: 'สร้างมาเพื่อกฎหมายไทย',
    s9: 'วันหยุดราชการไทย',
    s10: 'นับวันครบกำหนดโดยข้ามวันหยุดให้',
    s11: 'ค่าธรรมเนียมศาล',
    s12: 'คำนวณเบื้องต้นตามตาราง 1 ท้าย ป.วิ.พ.',
    s13: 'VAT และหัก ณ ที่จ่าย',
    s14: 'แยก VAT งานคดีกับงานที่ปรึกษาให้ในใบแจ้งหนี้',
    s15: 'พอร์ทัลลูกความ',
    s16: 'ลูกความเช็กความคืบหน้าคดีได้เอง โดยไม่นับเป็นผู้ใช้',
    s17: 'เช็กนัดและสำนวน|ได้จากมือถือ',
    s18: 'ระหว่างรอขึ้นบัลลังก์ ดูนัดถัดไป เอกสารในสำนวน และงานที่ต้องตามได้จากโทรศัพท์',
    s19: 'เริ่มเปิดสำนวนแรกใน Samnuan',
    s20: 'วันนี้',
    s21: 'คดี',
    s22: 'ปฏิทินนัดศาล',
    s23: 'งาน',
    s24: 'ลูกความ',
    s25: 'ใบแจ้งหนี้',
    s26: 'พุธ 18 พ.ย. 2569',
    s27: '+ เพิ่มงาน',
    s28: '● นัดศาลวันนี้',
    s29: 'นัดสืบพยาน 09:00 · ศาลแพ่งกรุงเทพใต้ · บัลลังก์ 704',
    s30: 'ผบ. 987/2569 · บริษัท ตัวอย่างค้าส่ง จำกัด · ทนายสมศักดิ์',
    s31: 'งานที่ต้องส่งวันนี้',
    s32: 'ตรวจคำให้การ ผบ. 1234/2569',
    s33: 'ทนายกมล · 16:30',
    s34: 'ส่งหนังสือบอกกล่าวทวงถาม',
    s35: 'ธุรการวิภา · 18:00',
    s36: 'เตรียมนัดไกล่เกลี่ยพรุ่งนี้',
    s37: 'ทนายสมศักดิ์',
    s38: '● ครบกำหนดยื่นคำให้การ อีก 3 วัน',
    s39: 'พ. 88/2569 · รอทนายยืนยันวัน',
    s40: 'ยอดค้างชำระ',
    s41: '฿130,000',
    s42: '2 ใบแจ้งหนี้เกินกำหนด',
    s43: 'ตัวอย่างหน้า "วันนี้" ของทนาย · ข้อมูลสมมติ',
    s44: 'รายละเอียดคดี',
    s45: 'ตัวอย่างขนส่ง v. ตัวอย่างประกันภัย',
    s46: 'ทุนทรัพย์',
    s47: '฿4,850,000',
    s48: 'นัดถัดไป',
    s49: '15 ม.ค. 2570',
    s50: 'เอกสารในสำนวน',
    s51: 'นัดศาลวันนี้',
    s52: 'ศาลแพ่งกรุงเทพใต้',
    s53: 'ห้องพิจารณาคดี 704',
    s54: 'เตรียมก่อนขึ้นบัลลังก์',
    s55: '☑ ต้นฉบับสัญญา',
    s56: '☑ บัญชีระบุพยาน',
    s57: '☐ หนังสือมอบอำนาจ',
    s58: 'ตัวอย่างหน้าจอมือถือ · ข้อมูลสมมติ',
  },
  en: {
    s0: 'Case management software',
    s1: 'for Thai law firms',
    s2: 'Open case files, book court dates, assign team work, update clients and send invoices in one system designed for Thai courts and Thai law.',
    s3: 'Start 30-day free trial',
    s4: 'See pricing',
    s5: 'No credit card · No setup fee',
    s6: 'Every stage of a case,|in one system',
    s7: 'From the day a client walks in to the final invoice.',
    s8: 'Built for Thai law',
    s9: 'Thai public holidays',
    s10: 'Due dates are counted past holidays for you',
    s11: 'Court fees',
    s12: 'Estimated from Schedule 1 of the Civil Procedure Code',
    s13: 'VAT and withholding tax',
    s14: 'Litigation and advisory VAT split on every invoice',
    s15: 'Client portal',
    s16: "Clients follow their case themselves and don't count as users",
    s17: 'Check hearings and case files|from your phone',
    s18: 'While you wait to go into court, check your next hearing, the case documents and the tasks you need to chase.',
    s19: 'Open your first case file in Samnuan',
    s20: 'Today',
    s21: 'Cases',
    s22: 'Court calendar',
    s23: 'Tasks',
    s24: 'Clients',
    s25: 'Invoices',
    s26: 'Wed 18 Nov 2026',
    s27: '+ Add task',
    s28: '● Court hearing today',
    s29: 'Witness hearing 09:00 · Bangkok South Civil Court · Courtroom 704',
    s30: 'Case ผบ. 987/2569 · Example Wholesale Co., Ltd. · Lawyer Somsak',
    s31: 'Tasks due today',
    s32: 'Review statement of defence for case ผบ. 1234/2569',
    s33: 'Lawyer Kamon · 16:30',
    s34: 'Send demand letter',
    s35: 'Office staff Wipa · 18:00',
    s36: 'Prepare for mediation tomorrow',
    s37: 'Lawyer Somsak',
    s38: '● Statement of defence due in 3 days',
    s39: 'Case พ. 88/2569 · Awaiting lawyer confirmation',
    s40: 'Outstanding balance',
    s41: 'THB 130,000',
    s42: '2 overdue invoices',
    s43: 'Sample screen · fictional data',
    s44: 'Case details',
    s45: 'Example Logistics Co., Ltd. v. Example Insurance PCL',
    s46: 'Amount in dispute',
    s47: 'THB 4,850,000',
    s48: 'Next hearing',
    s49: '15 Jan 2027',
    s50: 'Case documents',
    s51: 'Court hearing today',
    s52: 'Bangkok South Civil Court',
    s53: 'Courtroom 704',
    s54: 'Prepare for court',
    s55: '☑ Original contract',
    s56: '☑ Witness list',
    s57: '☐ Power of attorney',
    s58: 'Sample screen · fictional data',
  },
};

function TodayScreen({ lang }: { lang: Lang }) {
  const c = copy[lang];
  return (
    <section className="mx-auto mt-14 max-w-[1240px] px-4 md:px-6">
      <figure>
        <div className="rise relative overflow-hidden rounded-xl border border-mk-rule bg-mk-surface">
          <div className="flex min-w-0 flex-col md:flex-row">
            <aside className="min-w-0 shrink-0 bg-mk-ink p-5 text-mk-paper md:w-56">
              <p className="flex items-center gap-2 border-b border-white/10 pb-4 font-display text-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-mk-paper text-xs font-bold text-mk-ink">
                  ส
                </span>
                Samnuan
              </p>
              <div className="mt-4 flex gap-1 overflow-x-auto whitespace-nowrap text-sm md:flex-col md:overflow-visible">
                {[c.s20, c.s21, c.s22, c.s23, c.s24, c.s25].map((item, i) => (
                  <span
                    key={item}
                    className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 ${i === 0 ? 'bg-white/10 font-medium' : 'text-mk-cta-muted'}`}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </aside>
            <div className="min-w-0 flex-1 space-y-5 bg-mk-paper p-5 text-left md:p-8">
              <div className="flex items-end justify-between gap-2 border-b border-mk-rule pb-3">
                <div>
                  <p className="text-xs text-mk-ink-2">{c.s20}</p>
                  <p className="font-display text-xl font-semibold">{c.s26}</p>
                </div>
                <span className="whitespace-nowrap rounded-lg bg-mk-ink px-3 py-1.5 text-xs font-medium text-mk-paper">
                  {c.s27}
                </span>
              </div>
              <div className="rounded-lg border border-mk-rule bg-mk-surface p-5">
                <span className="inline-flex whitespace-nowrap rounded border border-mk-brass/30 bg-mk-brass-soft px-2 py-0.5 text-xs font-medium text-mk-brass">
                  {c.s28}
                </span>
                <p className="mt-2 font-display text-lg font-semibold md:text-xl">{c.s29}</p>
                <p className="mt-1 text-sm text-mk-ink-2">{c.s30}</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-12">
                <div className="rounded-lg border border-mk-rule bg-mk-surface p-5 lg:col-span-7">
                  <p className="border-b border-mk-rule pb-2 text-sm font-semibold">{c.s31}</p>
                  <ul className="divide-y divide-mk-rule text-sm">
                    {[
                      [c.s32, c.s33],
                      [c.s34, c.s35],
                      [c.s36, c.s37],
                    ].map(([title, detail]) => (
                      <li className="py-3" key={title}>
                        <p className="font-medium">{title}</p>
                        <p className="text-xs text-mk-ink-2">{detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-lg border border-mk-rule bg-mk-surface p-4">
                    <p className="text-xs font-semibold text-mk-brass">{c.s38}</p>
                    <p className="mt-1 text-xs text-mk-ink-2">{c.s39}</p>
                  </div>
                  <div className="rounded-lg border border-mk-rule bg-mk-surface p-4">
                    <p className="text-xs text-mk-ink-2">{c.s40}</p>
                    <p className="font-display text-2xl font-semibold">{c.s41}</p>
                    <p className="text-xs text-mk-warn">{c.s42}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-mk-paper to-transparent" />
        </div>
        <figcaption className="mt-3 text-center text-xs text-mk-ink-2">{c.s43}</figcaption>
      </figure>
    </section>
  );
}

export function MarketingHome({ lang = 'th' }: { lang?: Lang } = {}) {
  const c = copy[lang];
  return (
    <div className="mk font-sans antialiased">
      <MarketingNav active="features" path="/" lang={lang} />
      <main>
        <section className="px-4 pt-16 text-center md:pt-24">
          <h1 className="mx-auto max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.25] tracking-tight md:text-6xl md:leading-[1.2]">
            {c.s0}
            <br />
            {c.s1}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-mk-ink-2">{c.s2}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="/register"
              className="btn-primary whitespace-nowrap rounded-lg bg-mk-ink px-6 py-3 font-medium text-mk-paper"
            >
              {c.s3}
            </a>
            <a
              href="#pricing"
              className="whitespace-nowrap rounded-lg border border-mk-ink px-6 py-3 font-medium hover:bg-mk-surface"
            >
              {c.s4}
            </a>
          </div>
          <p className="mt-4 text-sm text-mk-ink-2">{c.s5}</p>
        </section>
        <TodayScreen lang={lang} />
        <section id="features" className="mx-auto max-w-[1240px] px-4 py-24 md:px-6">
          <Reveal>
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 className="font-display text-3xl font-semibold leading-snug md:text-[2.6rem]">
                <BalancedHeading text={c.s6} />
              </h2>
              <p className="mt-3 text-lg text-mk-ink-2">
                <BalancedHeading text={c.s7} />
              </p>
            </div>
          </Reveal>
          <Reveal>
            <CaseTour active="cases" autoplay lang={lang} />
          </Reveal>
        </section>
        <Reveal>
          <section className="mx-auto max-w-[1240px] px-4 md:px-6">
            <h2 className="text-center font-display text-3xl font-semibold md:text-4xl">{c.s8}</h2>
            <div className="mt-10 grid border-y border-mk-rule md:grid-cols-4 md:divide-x divide-mk-rule">
              {[
                [c.s9, c.s10],
                [c.s11, c.s12],
                [c.s13, c.s14],
                [c.s15, c.s16],
              ].map(([title, detail]) => (
                <div key={title} className="border-b border-mk-rule py-6 last:border-0 md:border-0 md:px-6">
                  <p className="font-display text-lg font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-mk-ink-2">{detail}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>
        <Reveal>
          <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-4 py-24 md:px-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <h2 className="font-display text-3xl font-semibold leading-snug md:text-4xl">
                <BalancedHeading text={c.s17} />
              </h2>
              <p className="mt-4 leading-relaxed text-mk-ink-2">{c.s18}</p>
            </div>
            <figure className="min-w-0 lg:col-span-7">
              <div className="flex flex-col justify-end gap-5 sm:flex-row">
                <div className="w-full rounded-2xl border border-mk-rule bg-mk-surface p-5 sm:w-[280px]">
                  <p className="border-b border-mk-rule pb-3 text-xs font-semibold">{c.s44}</p>
                  <p className="mt-4 text-xs tabular-nums text-mk-ink-2">ผบ. 1234/2569</p>
                  <p className="font-display font-semibold">{c.s45}</p>
                  <div className="mt-4 space-y-2 rounded-lg bg-mk-sunk p-3 text-xs">
                    <p className="flex justify-between">
                      <span className="text-mk-ink-2">{c.s46}</span>
                      <span>{c.s47}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-mk-ink-2">{c.s48}</span>
                      <span className="text-mk-brass">{c.s49}</span>
                    </p>
                  </div>
                  <p className="mt-4 flex justify-between border-t border-mk-rule pt-3 text-xs">
                    <span>{c.s50}</span>
                    <span>›</span>
                  </p>
                </div>
                <div className="w-full rounded-2xl border border-mk-rule bg-mk-surface p-5 sm:w-[280px]">
                  <p className="flex justify-between border-b border-mk-rule pb-3 text-xs">
                    <span className="font-semibold text-mk-brass">{c.s51}</span>
                    <span className="tabular-nums text-mk-ink-2">09:00</span>
                  </p>
                  <p className="mt-4 font-display font-semibold">{c.s52}</p>
                  <p className="text-xs text-mk-ink-2">{c.s53}</p>
                  <p className="mt-4 text-xs font-semibold">{c.s54}</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-mk-ink-2">
                    <li>{c.s55}</li>
                    <li>{c.s56}</li>
                    <li>{c.s57}</li>
                  </ul>
                </div>
              </div>
              <figcaption className="mt-3 text-center text-xs text-mk-ink-2">{c.s58}</figcaption>
            </figure>
          </section>
        </Reveal>
        <MarketingPricing lang={lang} />
        <CtaBand title={c.s19} lang={lang} />
      </main>
      <MarketingFooter lang={lang} />
    </div>
  );
}
