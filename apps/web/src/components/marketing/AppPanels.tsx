import type { ReactNode } from 'react';
import type { Lang } from '@/lib/marketing/i18n';
import type { FeatureKey } from '@/lib/marketing/features';

const copy = {
  th: {
    s0: 'ผบ. 1234/2569 · ศาลแพ่งกรุงเทพใต้',
    s1: 'โจทก์: บริษัท ตัวอย่างขนส่ง จำกัด · จำเลย: บริษัท ตัวอย่างประกันภัย จำกัด',
    s2: 'คดีแพ่งสามัญ · ชั้นให้การ',
    s3: 'เอกสารในสำนวน',
    s4: 'คำฟ้อง.pdf',
    s5: 'สัญญาว่าจ้างขนส่ง.pdf',
    s6: 'หมายเรียกและสำเนาคำฟ้อง.pdf',
    s7: '2 พ.ย.',
    s8: 'ใหม่',
    s9: 'ความเคลื่อนไหว',
    s10: 'รับหมายเรียก',
    s11: '17 พ.ย. · ทนายสมศักดิ์',
    s12: 'ยื่นฟ้อง',
    s13: '2 พ.ย. · ทนายสมศักดิ์',
    s14: 'เปิดสำนวน',
    s15: '28 ต.ค. · ธุรการ',
    s16: 'ปฏิทินทีม · 16–20 พ.ย. 2569',
    s17: 'สัปดาห์นี้',
    s18: 'จ.',
    s19: 'อ.',
    s20: 'พ.',
    s21: 'พฤ.',
    s22: 'ศ.',
    s23: '15:00 ประชุมลูกความ',
    s24: 'ห้องประชุม 1',
    s25: '13:30 นัดไกล่เกลี่ย',
    s26: 'ศาลแรงงานกลาง',
    s27: '09:00 นัดสืบพยาน',
    s28: 'ศาลแพ่งกรุงเทพใต้',
    s29: 'ลา · คุณนภา',
    s30: 'ทั้งวัน',
    s31: '09:30 ชี้สองสถาน',
    s32: 'ศาลแพ่ง',
    s33: 'ทนายสมศักดิ์ติดศาลวันพุธและพฤหัส · คุณนภาลาวันพุธ',
    s34: 'กำหนดเวลาที่ระบบเสนอจากวันรับหมาย 17 พ.ย. 2569',
    s35: 'ยื่นคำให้การ · ครบ 2 ธ.ค. 2569',
    s36: '15 วันนับจากวันรับหมาย ข้ามเสาร์-อาทิตย์และวันหยุดราชการ',
    s37: 'ยืนยันวัน',
    s38: 'ยื่นบัญชีระบุพยาน · 7 วันก่อนวันสืบ',
    s39: 'คำนวณจากวันนัดสืบพยานในปฏิทิน',
    s40: 'ยืนยันแล้ว',
    s41: 'อุทธรณ์ · ภายใน 1 เดือน',
    s42: 'เริ่มนับเมื่อบันทึกวันอ่านคำพิพากษา',
    s43: 'ยังไม่ถึงขั้นนี้',
    s44: 'งานของทีม · สัปดาห์นี้',
    s45: 'ค้างอยู่ 7 งาน',
    s46: 'ต้องทำ',
    s47: 'ร่างคำให้การ ผบ. 1234/2569',
    s48: 'ทนายสมศักดิ์ · ส่ง 28 พ.ย.',
    s49: 'ขอคัดถ่ายสำนวน',
    s50: 'ธุรการวิภา · ส่ง 20 พ.ย.',
    s51: 'กำลังทำ',
    s52: 'ตรวจสัญญาเช่า ลูกความใหม่',
    s53: 'ทนายกมล · ส่ง 19 พ.ย.',
    s54: 'เตรียมพยานเอกสาร',
    s55: 'ทนายสมศักดิ์ · ส่ง 24 พ.ย.',
    s56: 'รอตรวจ',
    s57: 'หนังสือบอกกล่าวทวงถาม',
    s58: 'ทนายกมล → หัวหน้า',
    s59: 'พอร์ทัลลูกความ · บริษัท ตัวอย่างขนส่ง จำกัด',
    s60: 'ยื่นฟ้องแล้ว',
    s61: '2 พ.ย. 2569',
    s62: 'จำเลยอยู่ระหว่างยื่นคำให้การ',
    s63: 'อัปเดตล่าสุด 17 พ.ย.',
    s64: 'นัดสืบพยาน',
    s65: '15 ม.ค. 2570 · 09:00',
    s66: 'ข้อความถึงลูกความ',
    s67: 'มีเอกสารใหม่ในคดีของคุณ: หมายเรียกและสำเนาคำฟ้อง',
    s68: 'นัดสืบพยาน 15 ม.ค. 2570 เวลา 09:00 ศาลแพ่งกรุงเทพใต้',
    s69: 'ลูกความที่เข้าพอร์ทัลไม่นับเป็นผู้ใช้',
    s70: 'ใบแจ้งหนี้ / Invoice',
    s71: 'รอชำระ · ครบ 30 พ.ย.',
    s72: 'รายการ',
    s73: 'ภาษี',
    s74: 'จำนวนเงิน',
    s75: 'ค่าวิชาชีพว่าความ งวดที่ 2',
    s76: 'ยกเว้น VAT',
    s77: 'ค่าที่ปรึกษากฎหมาย',
    s78: 'ค่าธรรมเนียมศาล (ทดรองจ่าย)',
    s79: 'ค่าใช้จ่ายแทน',
    s80: 'รวม',
  },
  en: {
    s0: 'Case ผบ. 1234/2569 · Bangkok South Civil Court',
    s1: 'Plaintiff: Example Logistics Co., Ltd. · Defendant: Example Insurance PCL',
    s2: 'General civil case · Defence stage',
    s3: 'Case documents',
    s4: 'Complaint.pdf',
    s5: 'Transport contract.pdf',
    s6: 'Summons and complaint.pdf',
    s7: '2 Nov',
    s8: 'New',
    s9: 'Activity',
    s10: 'Summons received',
    s11: '17 Nov · Lawyer Somsak',
    s12: 'Complaint filed',
    s13: '2 Nov · Lawyer Somsak',
    s14: 'Case opened',
    s15: '28 Oct · Office staff',
    s16: 'Team calendar · 16–20 Nov 2026',
    s17: 'This week',
    s18: 'Mon',
    s19: 'Tue',
    s20: 'Wed',
    s21: 'Thu',
    s22: 'Fri',
    s23: '15:00 Client meeting',
    s24: 'Meeting room 1',
    s25: '13:30 Mediation',
    s26: 'Central Labour Court',
    s27: '09:00 Witness hearing',
    s28: 'Bangkok South Civil Court',
    s29: 'Napa · On leave',
    s30: 'All day',
    s31: '09:30 Issue-settlement hearing',
    s32: 'Civil Court',
    s33: 'Somsak is in court on Wednesday and Thursday · Napa is on leave on Wednesday',
    s34: 'Suggested deadlines from the summons received on 17 Nov 2026',
    s35: 'File statement of defence · Due 2 Dec 2026',
    s36: '15 days from receipt of summons, skipping weekends and public holidays',
    s37: 'Confirm date',
    s38: 'File witness list · 7 days before the hearing',
    s39: 'Calculated from the witness hearing date in the calendar',
    s40: 'Confirmed',
    s41: 'Appeal · Within 1 month',
    s42: 'Count starts when the judgment reading date is recorded',
    s43: 'Not at this stage yet',
    s44: 'Team tasks · This week',
    s45: '7 outstanding tasks',
    s46: 'To do',
    s47: 'Draft statement of defence for case ผบ. 1234/2569',
    s48: 'Lawyer Somsak · Due 28 Nov',
    s49: 'Request a copy of the case file',
    s50: 'Office staff Wipa · Due 20 Nov',
    s51: 'In progress',
    s52: 'Review lease for new client',
    s53: 'Lawyer Kamon · Due 19 Nov',
    s54: 'Prepare documentary evidence',
    s55: 'Lawyer Somsak · Due 24 Nov',
    s56: 'Awaiting review',
    s57: 'Demand letter',
    s58: 'Lawyer Kamon → Supervisor',
    s59: 'Client portal · Example Logistics Co., Ltd.',
    s60: 'Complaint filed',
    s61: '2 Nov 2026',
    s62: 'Defendant is preparing a statement of defence',
    s63: 'Last updated 17 Nov',
    s64: 'Witness hearing',
    s65: '15 Jan 2027 · 09:00',
    s66: 'Messages to client',
    s67: 'New documents in your case: summons and complaint',
    s68: 'Witness hearing on 15 Jan 2027 at 09:00, Bangkok South Civil Court',
    s69: 'Clients using the portal do not count as users',
    s70: 'Invoice',
    s71: 'Awaiting payment · Due 30 Nov',
    s72: 'Item',
    s73: 'Tax',
    s74: 'Amount',
    s75: 'Litigation professional fees, second instalment',
    s76: 'VAT exempt',
    s77: 'Legal advisory fees',
    s78: 'Court fees (paid on behalf of client)',
    s79: 'Paid on behalf',
    s80: 'Total',
  },
};

function panelsFor(lang: Lang): Record<FeatureKey, ReactNode> {
  const c = copy[lang];
  return {
    cases: (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mk-rule pb-4">
          <div>
            <p className="font-display text-lg font-semibold text-mk-ink">{c.s0}</p>
            <p className="mt-1 text-xs text-mk-ink-2">{c.s1}</p>
          </div>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
            {c.s2}
          </span>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-5">
          <div className="md:col-span-3">
            <p className="mb-2 text-xs font-semibold text-mk-ink-2">{c.s3}</p>
            <ul className="divide-y divide-rule rounded-lg border border-mk-rule bg-mk-surface text-sm">
              <li className="tour-row flex items-center justify-between px-4 py-3">
                <span className="text-mk-ink">{c.s4}</span>
                <span className="text-xs text-mk-ink-2">{c.s7}</span>
              </li>
              <li className="tour-row flex items-center justify-between px-4 py-3">
                <span className="text-mk-ink">{c.s5}</span>
                <span className="text-xs text-mk-ink-2">{c.s7}</span>
              </li>
              <li className="tour-row flex items-center justify-between px-4 py-3">
                <span className="text-mk-ink">{c.s6}</span>
                <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-brass-soft text-mk-brass border-mk-brass/30">
                  {c.s8}
                </span>
              </li>
            </ul>
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-xs font-semibold text-mk-ink-2">{c.s9}</p>
            <ol className="space-y-3 border-l border-mk-rule pl-4 text-xs text-mk-ink-2">
              <li className="tour-row">
                <span className="font-medium text-mk-ink">{c.s10}</span>
                <br />
                {c.s11}
              </li>
              <li className="tour-row">
                <span className="font-medium text-mk-ink">{c.s12}</span>
                <br />
                {c.s13}
              </li>
              <li className="tour-row">
                <span className="font-medium text-mk-ink">{c.s14}</span>
                <br />
                {c.s15}
              </li>
            </ol>
          </div>
        </div>
      </>
    ),
    calendar: (
      <>
        <div className="flex items-center justify-between border-b border-mk-rule pb-4">
          <p className="font-display text-lg font-semibold text-mk-ink">{c.s16}</p>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
            {c.s17}
          </span>
        </div>
        <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[620px] grid-cols-5 gap-2 text-xs">
            <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
              <p className="mb-2 flex justify-between text-mk-ink-2">
                <span>{c.s18}</span>
                <span className="font-semibold text-mk-ink">16</span>
              </p>
              <div className="tour-row mb-2 rounded bg-mk-sunk p-1.5">
                <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-ink-2"></span>
                  {c.s23}
                </p>
                <p className="text-mk-ink-2">{c.s24}</p>
              </div>
            </div>
            <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
              <p className="mb-2 flex justify-between text-mk-ink-2">
                <span>{c.s19}</span>
                <span className="font-semibold text-mk-ink">17</span>
              </p>
              <div className="tour-row mb-2 rounded bg-mk-brass-soft p-1.5">
                <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass"></span>
                  {c.s25}
                </p>
                <p className="text-mk-ink-2">{c.s26}</p>
              </div>
            </div>
            <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
              <p className="mb-2 flex justify-between text-mk-ink-2">
                <span>{c.s20}</span>
                <span className="font-semibold text-mk-ink">18</span>
              </p>
              <div className="tour-row mb-2 rounded bg-mk-brass-soft p-1.5">
                <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass"></span>
                  {c.s27}
                </p>
                <p className="text-mk-ink-2">{c.s28}</p>
              </div>
              <div className="tour-row mb-2 rounded bg-mk-warn-soft p-1.5">
                <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-warn"></span>
                  {c.s29}
                </p>
                <p className="text-mk-ink-2">{c.s30}</p>
              </div>
            </div>
            <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
              <p className="mb-2 flex justify-between text-mk-ink-2">
                <span>{c.s21}</span>
                <span className="font-semibold text-mk-ink">19</span>
              </p>
              <div className="tour-row mb-2 rounded bg-mk-brass-soft p-1.5">
                <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass"></span>
                  {c.s31}
                </p>
                <p className="text-mk-ink-2">{c.s32}</p>
              </div>
            </div>
            <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
              <p className="mb-2 flex justify-between text-mk-ink-2">
                <span>{c.s22}</span>
                <span className="font-semibold text-mk-ink">20</span>
              </p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-mk-ink-2">{c.s33}</p>
      </>
    ),
    deadlines: (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mk-rule pb-4">
          <div>
            <p className="font-display text-lg font-semibold text-mk-ink">{c.s0}</p>
            <p className="mt-1 text-xs text-mk-ink-2">{c.s34}</p>
          </div>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
            {c.s2}
          </span>
        </div>
        <div className="mt-5 space-y-3">
          <div className="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mk-rule bg-mk-surface p-4 border-mk-brass/40">
            <div>
              <p className="flex items-center gap-2 font-medium text-mk-ink">
                <span className="h-2 w-2 rounded-full bg-mk-brass pulse-once"></span>
                {c.s35}
              </p>
              <p className="mt-1 pl-4 text-xs text-mk-ink-2">{c.s36}</p>
            </div>
            {/* Depicts the app's button; inert on the marketing page. */}
            <span className="whitespace-nowrap rounded-md bg-mk-ink px-4 py-2 text-xs font-medium text-mk-paper">
              {c.s37}
            </span>
          </div>
          <div className="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mk-rule bg-mk-surface p-4 ">
            <div>
              <p className="font-medium text-mk-ink">{c.s38}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s39}</p>
            </div>
            <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-ok-soft text-mk-ok border-mk-ok/25">
              {c.s40}
            </span>
          </div>
          <div className="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mk-rule bg-mk-surface p-4 ">
            <div>
              <p className="font-medium text-mk-ink">{c.s41}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s42}</p>
            </div>
            <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
              {c.s43}
            </span>
          </div>
        </div>
      </>
    ),
    team: (
      <>
        <div className="flex items-center justify-between border-b border-mk-rule pb-4">
          <p className="font-display text-lg font-semibold text-mk-ink">{c.s44}</p>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
            {c.s45}
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3 text-sm">
          <div className="rounded-lg border border-mk-rule bg-mk-sunk/60 p-3">
            <p className="mb-2 text-xs font-semibold text-mk-ink-2">{c.s46}</p>
            <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
              <p className="font-medium text-mk-ink">{c.s47}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s48}</p>
            </div>
            <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
              <p className="font-medium text-mk-ink">{c.s49}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s50}</p>
            </div>
          </div>
          <div className="rounded-lg border border-mk-rule bg-mk-sunk/60 p-3">
            <p className="mb-2 text-xs font-semibold text-mk-ink-2">{c.s51}</p>
            <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
              <p className="font-medium text-mk-ink">{c.s52}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s53}</p>
            </div>
            <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
              <p className="font-medium text-mk-ink">{c.s54}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s55}</p>
            </div>
          </div>
          <div className="rounded-lg border border-mk-rule bg-mk-sunk/60 p-3">
            <p className="mb-2 text-xs font-semibold text-mk-ink-2">{c.s56}</p>
            <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
              <p className="font-medium text-mk-ink">{c.s57}</p>
              <p className="mt-1 text-xs text-mk-ink-2">{c.s58}</p>
            </div>
          </div>
        </div>
      </>
    ),
    portal: (
      <>
        <div className="grid gap-5 md:grid-cols-5">
          <div className="md:col-span-3 rounded-lg border border-mk-rule bg-mk-surface p-5">
            <p className="text-xs text-mk-ink-2">{c.s59}</p>
            <p className="mt-1 font-display text-lg font-semibold text-mk-ink">ผบ. 1234/2569</p>
            <ol className="mt-4 space-y-3 text-sm">
              <li className="tour-row flex gap-3">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-mk-ok"></span>
                <div>
                  <p className="text-mk-ink">{c.s60}</p>
                  <p className="text-xs text-mk-ink-2">{c.s61}</p>
                </div>
              </li>
              <li className="tour-row flex gap-3">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-mk-brass"></span>
                <div>
                  <p className="text-mk-ink">{c.s62}</p>
                  <p className="text-xs text-mk-ink-2">{c.s63}</p>
                </div>
              </li>
              <li className="tour-row flex gap-3">
                <span className="mt-1.5 h-2 w-2 rounded-full bg-mk-rule"></span>
                <div>
                  <p className="text-mk-ink">{c.s64}</p>
                  <p className="text-xs text-mk-ink-2">{c.s65}</p>
                </div>
              </li>
            </ol>
          </div>
          <div className="md:col-span-2 space-y-3">
            <p className="text-xs font-semibold text-mk-ink-2">{c.s66}</p>
            <div className="tour-row rounded-lg border border-mk-rule bg-mk-surface p-3 text-sm text-mk-ink">
              {c.s67}
            </div>
            <div className="tour-row rounded-lg border border-mk-rule bg-mk-surface p-3 text-sm text-mk-ink">
              {c.s68}
            </div>
            <p className="text-xs text-mk-ink-2">{c.s69}</p>
          </div>
        </div>
      </>
    ),
    billing: (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mk-rule pb-4">
          <div>
            <p className="text-xs text-mk-ink-2">{c.s70}</p>
            <p className="font-display text-lg font-semibold text-mk-ink">INV-2569-0142</p>
          </div>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-brass-soft text-mk-brass border-mk-brass/30">
            {c.s71}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-mk-rule text-left text-xs text-mk-ink-2">
                <th className="py-2 font-medium">{c.s72}</th>
                <th className="py-2 font-medium">{c.s73}</th>
                <th className="py-2 text-right font-medium">{c.s74}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              <tr className="tour-row">
                <td className="py-2.5 text-mk-ink">{c.s75}</td>
                <td>
                  <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
                    {c.s76}
                  </span>
                </td>
                <td className="text-right tabular-nums text-mk-ink">{lang === 'en' && 'THB '}30,000.00</td>
              </tr>
              <tr className="tour-row">
                <td className="py-2.5 text-mk-ink">{c.s77}</td>
                <td>
                  <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-brass-soft text-mk-brass border-mk-brass/30">
                    VAT 7%
                  </span>
                </td>
                <td className="text-right tabular-nums text-mk-ink">{lang === 'en' && 'THB '}20,000.00</td>
              </tr>
              <tr className="tour-row">
                <td className="py-2.5 text-mk-ink">{c.s78}</td>
                <td>
                  <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
                    {c.s79}
                  </span>
                </td>
                <td className="text-right tabular-nums text-mk-ink">{lang === 'en' && 'THB '}2,100.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
          <p className="flex justify-between text-mk-ink-2">
            <span>VAT 7%</span>
            <span className="tabular-nums">{lang === 'en' && 'THB '}1,400.00</span>
          </p>
          <p className="flex justify-between border-t border-mk-rule pt-1 font-semibold text-mk-ink">
            <span>{c.s80}</span>
            {lang === 'en' && <span>THB </span>}
            <span className="tabular-nums count" data-to="53500">
              53,500.00
            </span>
          </p>
        </div>
      </>
    ),
  };
}

export function AppPanel({ stage, lang = 'th' }: { stage: FeatureKey; lang?: Lang }) {
  return panelsFor(lang)[stage];
}
