import { MarketingNav } from './MarketingNav';
import { MarketingFooter } from './MarketingFooter';
import { CtaBand } from './CtaBand';
import { CaseTour } from './CaseTour';
import { Reveal } from './Reveal';
import { BalancedHeading } from './BalancedHeading';
import { MarketingPricing } from './MarketingPricing';
import './marketing.css';

function TodayScreen() {
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
                {['วันนี้', 'คดี', 'ปฏิทินนัดศาล', 'งาน', 'ลูกความ', 'ใบแจ้งหนี้'].map((item, i) => (
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
                  <p className="text-xs text-mk-ink-2">วันนี้</p>
                  <p className="font-display text-xl font-semibold">พุธ 18 พ.ย. 2569</p>
                </div>
                <span className="whitespace-nowrap rounded-lg bg-mk-ink px-3 py-1.5 text-xs font-medium text-mk-paper">
                  + เพิ่มงาน
                </span>
              </div>
              <div className="rounded-lg border border-mk-rule bg-mk-surface p-5">
                <span className="inline-flex whitespace-nowrap rounded border border-mk-brass/30 bg-mk-brass-soft px-2 py-0.5 text-xs font-medium text-mk-brass">
                  ● นัดศาลวันนี้
                </span>
                <p className="mt-2 font-display text-lg font-semibold md:text-xl">
                  นัดสืบพยาน 09:00 · ศาลแพ่งกรุงเทพใต้ · บัลลังก์ 704
                </p>
                <p className="mt-1 text-sm text-mk-ink-2">ผบ. 987/2569 · บริษัท ตัวอย่างค้าส่ง จำกัด · ทนายสมศักดิ์</p>
              </div>
              <div className="grid gap-5 lg:grid-cols-12">
                <div className="rounded-lg border border-mk-rule bg-mk-surface p-5 lg:col-span-7">
                  <p className="border-b border-mk-rule pb-2 text-sm font-semibold">งานที่ต้องส่งวันนี้</p>
                  <ul className="divide-y divide-mk-rule text-sm">
                    {[
                      ['ตรวจคำให้การ ผบ. 1234/2569', 'ทนายกมล · 16:30'],
                      ['ส่งหนังสือบอกกล่าวทวงถาม', 'ธุรการวิภา · 18:00'],
                      ['เตรียมนัดไกล่เกลี่ยพรุ่งนี้', 'ทนายสมศักดิ์'],
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
                    <p className="text-xs font-semibold text-mk-brass">● ครบกำหนดยื่นคำให้การ อีก 3 วัน</p>
                    <p className="mt-1 text-xs text-mk-ink-2">พ. 88/2569 · รอทนายยืนยันวัน</p>
                  </div>
                  <div className="rounded-lg border border-mk-rule bg-mk-surface p-4">
                    <p className="text-xs text-mk-ink-2">ยอดค้างชำระ</p>
                    <p className="font-display text-2xl font-semibold">฿130,000</p>
                    <p className="text-xs text-mk-warn">2 ใบแจ้งหนี้เกินกำหนด</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-mk-paper to-transparent" />
        </div>
        <figcaption className="mt-3 text-center text-xs text-mk-ink-2">
          ตัวอย่างหน้า &quot;วันนี้&quot; ของทนาย · ข้อมูลสมมติ
        </figcaption>
      </figure>
    </section>
  );
}

export function MarketingHome() {
  return (
    <div className="mk font-sans antialiased">
      <MarketingNav active="features" />
      <main>
        <section className="px-4 pt-16 text-center md:pt-24">
          <h1 className="mx-auto max-w-4xl font-display text-[2.6rem] font-semibold leading-[1.25] tracking-tight md:text-6xl md:leading-[1.2]">
            โปรแกรมจัดการคดี
            <br />
            สำหรับสำนักงานกฎหมายไทย
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-mk-ink-2">
            เปิดสำนวน ลงนัดศาล แบ่งงานในทีม อัปเดตลูกความ และออกใบแจ้งหนี้ ได้ในระบบเดียว ออกแบบมาสำหรับศาลและกฎหมายไทย
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="/register"
              className="btn-primary whitespace-nowrap rounded-lg bg-mk-ink px-6 py-3 font-medium text-mk-paper"
            >
              ทดลองใช้ฟรี 30 วัน
            </a>
            <a
              href="#pricing"
              className="whitespace-nowrap rounded-lg border border-mk-ink px-6 py-3 font-medium hover:bg-mk-surface"
            >
              ดูราคา
            </a>
          </div>
          <p className="mt-4 text-sm text-mk-ink-2">ไม่ต้องใช้บัตรเครดิต · ไม่มีค่าติดตั้ง</p>
        </section>
        <TodayScreen />
        <section id="features" className="mx-auto max-w-[1240px] px-4 py-24 md:px-6">
          <Reveal>
            <div className="mx-auto mb-14 max-w-3xl text-center">
              <h2 className="font-display text-3xl font-semibold leading-snug md:text-[2.6rem]">
                <BalancedHeading text="ทุกขั้นตอนของคดี|จบในระบบเดียว" />
              </h2>
              <p className="mt-3 text-lg text-mk-ink-2">
                <BalancedHeading text="ตั้งแต่วันที่ลูกความมาปรึกษา|จนถึงวันออกใบแจ้งหนี้งวดสุดท้าย" />
              </p>
            </div>
          </Reveal>
          <Reveal>
            <CaseTour active="cases" autoplay />
          </Reveal>
        </section>
        <Reveal>
          <section className="mx-auto max-w-[1240px] px-4 md:px-6">
            <h2 className="text-center font-display text-3xl font-semibold md:text-4xl">สร้างมาเพื่อกฎหมายไทย</h2>
            <div className="mt-10 grid border-y border-mk-rule md:grid-cols-4 md:divide-x divide-mk-rule">
              {[
                ['วันหยุดราชการไทย', 'นับวันครบกำหนดโดยข้ามวันหยุดให้'],
                ['ค่าธรรมเนียมศาล', 'คำนวณเบื้องต้นตามตาราง 1 ท้าย ป.วิ.พ.'],
                ['VAT และหัก ณ ที่จ่าย', 'แยก VAT งานคดีกับงานที่ปรึกษาให้ในใบแจ้งหนี้'],
                ['พอร์ทัลลูกความ', 'ลูกความเช็กความคืบหน้าคดีได้เอง โดยไม่นับเป็นผู้ใช้'],
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
                <BalancedHeading text="เช็กนัดและสำนวน|ได้จากมือถือ" />
              </h2>
              <p className="mt-4 leading-relaxed text-mk-ink-2">
                ระหว่างรอขึ้นบัลลังก์ ดูนัดถัดไป เอกสารในสำนวน และงานที่ต้องตามได้จากโทรศัพท์
              </p>
            </div>
            <figure className="min-w-0 lg:col-span-7">
              <div className="flex flex-col justify-end gap-5 sm:flex-row">
                <div className="w-full rounded-2xl border border-mk-rule bg-mk-surface p-5 sm:w-[280px]">
                  <p className="border-b border-mk-rule pb-3 text-xs font-semibold">รายละเอียดคดี</p>
                  <p className="mt-4 text-xs tabular-nums text-mk-ink-2">ผบ. 1234/2569</p>
                  <p className="font-display font-semibold">ตัวอย่างขนส่ง v. ตัวอย่างประกันภัย</p>
                  <div className="mt-4 space-y-2 rounded-lg bg-mk-sunk p-3 text-xs">
                    <p className="flex justify-between">
                      <span className="text-mk-ink-2">ทุนทรัพย์</span>
                      <span>฿4,850,000</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-mk-ink-2">นัดถัดไป</span>
                      <span className="text-mk-brass">15 ม.ค. 2570</span>
                    </p>
                  </div>
                  <p className="mt-4 flex justify-between border-t border-mk-rule pt-3 text-xs">
                    <span>เอกสารในสำนวน</span>
                    <span>›</span>
                  </p>
                </div>
                <div className="w-full rounded-2xl border border-mk-rule bg-mk-surface p-5 sm:w-[280px]">
                  <p className="flex justify-between border-b border-mk-rule pb-3 text-xs">
                    <span className="font-semibold text-mk-brass">นัดศาลวันนี้</span>
                    <span className="tabular-nums text-mk-ink-2">09:00</span>
                  </p>
                  <p className="mt-4 font-display font-semibold">ศาลแพ่งกรุงเทพใต้</p>
                  <p className="text-xs text-mk-ink-2">ห้องพิจารณาคดี 704</p>
                  <p className="mt-4 text-xs font-semibold">เตรียมก่อนขึ้นบัลลังก์</p>
                  <ul className="mt-2 space-y-1.5 text-xs text-mk-ink-2">
                    <li>☑ ต้นฉบับสัญญา</li>
                    <li>☑ บัญชีระบุพยาน</li>
                    <li>☐ หนังสือมอบอำนาจ</li>
                  </ul>
                </div>
              </div>
              <figcaption className="mt-3 text-center text-xs text-mk-ink-2">
                ตัวอย่างหน้าจอมือถือ · ข้อมูลสมมติ
              </figcaption>
            </figure>
          </section>
        </Reveal>
        <MarketingPricing />
        <CtaBand title="เริ่มเปิดสำนวนแรกใน Samnuan" />
      </main>
      <MarketingFooter />
    </div>
  );
}
