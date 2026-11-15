import type { ReactNode } from 'react';
import type { FeatureKey } from '@/lib/marketing/features';

const panels: Record<FeatureKey, ReactNode> = {
  cases: (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mk-rule pb-4">
        <div>
          <p className="font-display text-lg font-semibold text-mk-ink">ผบ. 1234/2569 · ศาลแพ่งกรุงเทพใต้</p>
          <p className="mt-1 text-xs text-mk-ink-2">
            โจทก์: บริษัท ตัวอย่างขนส่ง จำกัด · จำเลย: บริษัท ตัวอย่างประกันภัย จำกัด
          </p>
        </div>
        <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
          คดีแพ่งสามัญ · ชั้นให้การ
        </span>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-5">
        <div className="md:col-span-3">
          <p className="mb-2 text-xs font-semibold text-mk-ink-2">เอกสารในสำนวน</p>
          <ul className="divide-y divide-rule rounded-lg border border-mk-rule bg-mk-surface text-sm">
            <li className="tour-row flex items-center justify-between px-4 py-3">
              <span className="text-mk-ink">คำฟ้อง.pdf</span>
              <span className="text-xs text-mk-ink-2">2 พ.ย.</span>
            </li>
            <li className="tour-row flex items-center justify-between px-4 py-3">
              <span className="text-mk-ink">สัญญาว่าจ้างขนส่ง.pdf</span>
              <span className="text-xs text-mk-ink-2">2 พ.ย.</span>
            </li>
            <li className="tour-row flex items-center justify-between px-4 py-3">
              <span className="text-mk-ink">หมายเรียกและสำเนาคำฟ้อง.pdf</span>
              <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-brass-soft text-mk-brass border-mk-brass/30">
                ใหม่
              </span>
            </li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <p className="mb-2 text-xs font-semibold text-mk-ink-2">ความเคลื่อนไหว</p>
          <ol className="space-y-3 border-l border-mk-rule pl-4 text-xs text-mk-ink-2">
            <li className="tour-row">
              <span className="font-medium text-mk-ink">รับหมายเรียก</span>
              <br />
              17 พ.ย. · ทนายสมศักดิ์
            </li>
            <li className="tour-row">
              <span className="font-medium text-mk-ink">ยื่นฟ้อง</span>
              <br />2 พ.ย. · ทนายสมศักดิ์
            </li>
            <li className="tour-row">
              <span className="font-medium text-mk-ink">เปิดสำนวน</span>
              <br />
              28 ต.ค. · ธุรการ
            </li>
          </ol>
        </div>
      </div>
    </>
  ),
  calendar: (
    <>
      <div className="flex items-center justify-between border-b border-mk-rule pb-4">
        <p className="font-display text-lg font-semibold text-mk-ink">ปฏิทินทีม · 16–20 พ.ย. 2569</p>
        <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
          สัปดาห์นี้
        </span>
      </div>
      <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[620px] grid-cols-5 gap-2 text-xs">
          <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
            <p className="mb-2 flex justify-between text-mk-ink-2">
              <span>จ.</span>
              <span className="font-semibold text-mk-ink">16</span>
            </p>
            <div className="tour-row mb-2 rounded bg-mk-sunk p-1.5">
              <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-ink-2"></span>15:00 ประชุมลูกความ
              </p>
              <p className="text-mk-ink-2">ห้องประชุม 1</p>
            </div>
          </div>
          <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
            <p className="mb-2 flex justify-between text-mk-ink-2">
              <span>อ.</span>
              <span className="font-semibold text-mk-ink">17</span>
            </p>
            <div className="tour-row mb-2 rounded bg-mk-brass-soft p-1.5">
              <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass"></span>13:30 นัดไกล่เกลี่ย
              </p>
              <p className="text-mk-ink-2">ศาลแรงงานกลาง</p>
            </div>
          </div>
          <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
            <p className="mb-2 flex justify-between text-mk-ink-2">
              <span>พ.</span>
              <span className="font-semibold text-mk-ink">18</span>
            </p>
            <div className="tour-row mb-2 rounded bg-mk-brass-soft p-1.5">
              <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass"></span>09:00 นัดสืบพยาน
              </p>
              <p className="text-mk-ink-2">ศาลแพ่งกรุงเทพใต้</p>
            </div>
            <div className="tour-row mb-2 rounded bg-mk-warn-soft p-1.5">
              <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-warn"></span>ลา · คุณนภา
              </p>
              <p className="text-mk-ink-2">ทั้งวัน</p>
            </div>
          </div>
          <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
            <p className="mb-2 flex justify-between text-mk-ink-2">
              <span>พฤ.</span>
              <span className="font-semibold text-mk-ink">19</span>
            </p>
            <div className="tour-row mb-2 rounded bg-mk-brass-soft p-1.5">
              <p className="flex items-center gap-1.5 font-medium text-mk-ink">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass"></span>09:30 ชี้สองสถาน
              </p>
              <p className="text-mk-ink-2">ศาลแพ่ง</p>
            </div>
          </div>
          <div className="min-h-[190px] rounded-lg border border-mk-rule bg-mk-surface p-2">
            <p className="mb-2 flex justify-between text-mk-ink-2">
              <span>ศ.</span>
              <span className="font-semibold text-mk-ink">20</span>
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-mk-ink-2">ทนายสมศักดิ์ติดศาลวันพุธและพฤหัส · คุณนภาลาวันพุธ</p>
    </>
  ),
  deadlines: (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mk-rule pb-4">
        <div>
          <p className="font-display text-lg font-semibold text-mk-ink">ผบ. 1234/2569 · ศาลแพ่งกรุงเทพใต้</p>
          <p className="mt-1 text-xs text-mk-ink-2">กำหนดเวลาที่ระบบเสนอจากวันรับหมาย 17 พ.ย. 2569</p>
        </div>
        <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
          คดีแพ่งสามัญ · ชั้นให้การ
        </span>
      </div>
      <div className="mt-5 space-y-3">
        <div className="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mk-rule bg-mk-surface p-4 border-mk-brass/40">
          <div>
            <p className="flex items-center gap-2 font-medium text-mk-ink">
              <span className="h-2 w-2 rounded-full bg-mk-brass pulse-once"></span>ยื่นคำให้การ · ครบ 2 ธ.ค. 2569
            </p>
            <p className="mt-1 pl-4 text-xs text-mk-ink-2">15 วันนับจากวันรับหมาย ข้ามเสาร์-อาทิตย์และวันหยุดราชการ</p>
          </div>
          {/* Depicts the app's button; inert on the marketing page. */}
          <span className="whitespace-nowrap rounded-md bg-mk-ink px-4 py-2 text-xs font-medium text-mk-paper">
            ยืนยันวัน
          </span>
        </div>
        <div className="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mk-rule bg-mk-surface p-4 ">
          <div>
            <p className="font-medium text-mk-ink">ยื่นบัญชีระบุพยาน · 7 วันก่อนวันสืบ</p>
            <p className="mt-1 text-xs text-mk-ink-2">คำนวณจากวันนัดสืบพยานในปฏิทิน</p>
          </div>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-ok-soft text-mk-ok border-mk-ok/25">
            ยืนยันแล้ว
          </span>
        </div>
        <div className="tour-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-mk-rule bg-mk-surface p-4 ">
          <div>
            <p className="font-medium text-mk-ink">อุทธรณ์ · ภายใน 1 เดือน</p>
            <p className="mt-1 text-xs text-mk-ink-2">เริ่มนับเมื่อบันทึกวันอ่านคำพิพากษา</p>
          </div>
          <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
            ยังไม่ถึงขั้นนี้
          </span>
        </div>
      </div>
    </>
  ),
  team: (
    <>
      <div className="flex items-center justify-between border-b border-mk-rule pb-4">
        <p className="font-display text-lg font-semibold text-mk-ink">งานของทีม · สัปดาห์นี้</p>
        <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
          ค้างอยู่ 7 งาน
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 text-sm">
        <div className="rounded-lg border border-mk-rule bg-mk-sunk/60 p-3">
          <p className="mb-2 text-xs font-semibold text-mk-ink-2">ต้องทำ</p>
          <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
            <p className="font-medium text-mk-ink">ร่างคำให้การ ผบ. 1234/2569</p>
            <p className="mt-1 text-xs text-mk-ink-2">ทนายสมศักดิ์ · ส่ง 28 พ.ย.</p>
          </div>
          <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
            <p className="font-medium text-mk-ink">ขอคัดถ่ายสำนวน</p>
            <p className="mt-1 text-xs text-mk-ink-2">ธุรการวิภา · ส่ง 20 พ.ย.</p>
          </div>
        </div>
        <div className="rounded-lg border border-mk-rule bg-mk-sunk/60 p-3">
          <p className="mb-2 text-xs font-semibold text-mk-ink-2">กำลังทำ</p>
          <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
            <p className="font-medium text-mk-ink">ตรวจสัญญาเช่า ลูกความใหม่</p>
            <p className="mt-1 text-xs text-mk-ink-2">ทนายกมล · ส่ง 19 พ.ย.</p>
          </div>
          <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
            <p className="font-medium text-mk-ink">เตรียมพยานเอกสาร</p>
            <p className="mt-1 text-xs text-mk-ink-2">ทนายสมศักดิ์ · ส่ง 24 พ.ย.</p>
          </div>
        </div>
        <div className="rounded-lg border border-mk-rule bg-mk-sunk/60 p-3">
          <p className="mb-2 text-xs font-semibold text-mk-ink-2">รอตรวจ</p>
          <div className="tour-row mb-2 rounded-md border border-mk-rule bg-mk-surface p-3">
            <p className="font-medium text-mk-ink">หนังสือบอกกล่าวทวงถาม</p>
            <p className="mt-1 text-xs text-mk-ink-2">ทนายกมล → หัวหน้า</p>
          </div>
        </div>
      </div>
    </>
  ),
  portal: (
    <>
      <div className="grid gap-5 md:grid-cols-5">
        <div className="md:col-span-3 rounded-lg border border-mk-rule bg-mk-surface p-5">
          <p className="text-xs text-mk-ink-2">พอร์ทัลลูกความ · บริษัท ตัวอย่างขนส่ง จำกัด</p>
          <p className="mt-1 font-display text-lg font-semibold text-mk-ink">ผบ. 1234/2569</p>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="tour-row flex gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-mk-ok"></span>
              <div>
                <p className="text-mk-ink">ยื่นฟ้องแล้ว</p>
                <p className="text-xs text-mk-ink-2">2 พ.ย. 2569</p>
              </div>
            </li>
            <li className="tour-row flex gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-mk-brass"></span>
              <div>
                <p className="text-mk-ink">จำเลยอยู่ระหว่างยื่นคำให้การ</p>
                <p className="text-xs text-mk-ink-2">อัปเดตล่าสุด 17 พ.ย.</p>
              </div>
            </li>
            <li className="tour-row flex gap-3">
              <span className="mt-1.5 h-2 w-2 rounded-full bg-mk-rule"></span>
              <div>
                <p className="text-mk-ink">นัดสืบพยาน</p>
                <p className="text-xs text-mk-ink-2">15 ม.ค. 2570 · 09:00</p>
              </div>
            </li>
          </ol>
        </div>
        <div className="md:col-span-2 space-y-3">
          <p className="text-xs font-semibold text-mk-ink-2">ข้อความถึงลูกความ</p>
          <div className="tour-row rounded-lg border border-mk-rule bg-mk-surface p-3 text-sm text-mk-ink">
            มีเอกสารใหม่ในคดีของคุณ: หมายเรียกและสำเนาคำฟ้อง
          </div>
          <div className="tour-row rounded-lg border border-mk-rule bg-mk-surface p-3 text-sm text-mk-ink">
            นัดสืบพยาน 15 ม.ค. 2570 เวลา 09:00 ศาลแพ่งกรุงเทพใต้
          </div>
          <p className="text-xs text-mk-ink-2">ลูกความที่เข้าพอร์ทัลไม่นับเป็นผู้ใช้</p>
        </div>
      </div>
    </>
  ),
  billing: (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-mk-rule pb-4">
        <div>
          <p className="text-xs text-mk-ink-2">ใบแจ้งหนี้ / Invoice</p>
          <p className="font-display text-lg font-semibold text-mk-ink">INV-2569-0142</p>
        </div>
        <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-brass-soft text-mk-brass border-mk-brass/30">
          รอชำระ · ครบ 30 พ.ย.
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-mk-rule text-left text-xs text-mk-ink-2">
              <th className="py-2 font-medium">รายการ</th>
              <th className="py-2 font-medium">ภาษี</th>
              <th className="py-2 text-right font-medium">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            <tr className="tour-row">
              <td className="py-2.5 text-mk-ink">ค่าวิชาชีพว่าความ งวดที่ 2</td>
              <td>
                <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
                  ยกเว้น VAT
                </span>
              </td>
              <td className="text-right tabular-nums text-mk-ink">30,000.00</td>
            </tr>
            <tr className="tour-row">
              <td className="py-2.5 text-mk-ink">ค่าที่ปรึกษากฎหมาย</td>
              <td>
                <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-brass-soft text-mk-brass border-mk-brass/30">
                  VAT 7%
                </span>
              </td>
              <td className="text-right tabular-nums text-mk-ink">20,000.00</td>
            </tr>
            <tr className="tour-row">
              <td className="py-2.5 text-mk-ink">ค่าธรรมเนียมศาล (ทดรองจ่าย)</td>
              <td>
                <span className="inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium bg-mk-sunk text-mk-ink-2 border-mk-rule">
                  ค่าใช้จ่ายแทน
                </span>
              </td>
              <td className="text-right tabular-nums text-mk-ink">2,100.00</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
        <p className="flex justify-between text-mk-ink-2">
          <span>VAT 7%</span>
          <span className="tabular-nums">1,400.00</span>
        </p>
        <p className="flex justify-between border-t border-mk-rule pt-1 font-semibold text-mk-ink">
          <span>รวม</span>
          <span className="tabular-nums count" data-to="53500">
            53,500.00
          </span>
        </p>
      </div>
    </>
  ),
};

export function AppPanel({ stage }: { stage: FeatureKey }) {
  return panels[stage];
}
