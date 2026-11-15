'use client';
import { useState } from 'react';
import { estimateCourtFee, type CourtFeeCaseKind } from '@lawfirm/shared';
export function CourtFeeEstimator() {
  const [amount, setAmount] = useState('1500000');
  const [kind, setKind] = useState<CourtFeeCaseKind>('GENERAL');
  const fee = estimateCourtFee({ kind, level: 'TRIAL', claimAmount: Number(amount) || 0 }).fee;
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-20 md:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-semibold leading-snug md:text-4xl">
            ค่าธรรมเนียมศาล คิดตามตาราง 1 ท้าย ป.วิ.พ.
          </h2>
          <p className="mt-4 leading-relaxed text-mk-ink-2">
            ตอนบันทึกค่าใช้จ่าย เลือกประเภทคดีและใส่ทุนทรัพย์ ระบบคำนวณค่าธรรมเนียมศาลเบื้องต้นให้
            ลองพิมพ์ตัวเลขดูได้เลย
          </p>
          <p className="mt-4 rounded-lg border border-mk-rule bg-mk-surface p-4 text-sm leading-relaxed text-mk-ink-2">
            คดีมีทุนทรัพย์: ร้อยละ 2 ของส่วนที่ไม่เกิน 50 ล้านบาท (สูงสุด 200,000 บาท) บวกร้อยละ 0.1 ของส่วนที่เกิน ·
            คดีผู้บริโภคและคดีแรงงานได้รับยกเว้น
          </p>
        </div>
        <div className="rounded-xl border border-mk-rule bg-mk-surface p-6">
          <label htmlFor="fee-amount" className="block text-sm text-mk-ink-2">
            ทุนทรัพย์ (บาท)
          </label>
          <input
            id="fee-amount"
            inputMode="numeric"
            value={amount ? Number(amount).toLocaleString('th-TH') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 15))}
            className="mt-1 w-full rounded-lg border border-mk-rule bg-mk-paper px-4 py-3 text-lg tabular-nums text-mk-ink"
          />
          <label htmlFor="fee-kind" className="mt-4 block text-sm text-mk-ink-2">
            ประเภทคดี
          </label>
          <select
            id="fee-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as CourtFeeCaseKind)}
            className="mt-1 w-full rounded-lg border border-mk-rule bg-mk-paper px-4 py-3 text-mk-ink"
          >
            <option value="GENERAL">คดีแพ่งทั่วไป (มีทุนทรัพย์)</option>
            <option value="CONSUMER">คดีผู้บริโภค</option>
            <option value="LABOUR">คดีแรงงาน</option>
          </select>
          <div className="mt-6 rounded-lg bg-mk-sunk p-4">
            <p className="text-xs text-mk-ink-2">ค่าธรรมเนียมศาลโดยประมาณ</p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {fee.toLocaleString('th-TH')} <span className="text-base">บาท</span>
            </p>
          </div>
          <p className="mt-3 text-xs text-mk-ink-2">ตัวเลขเป็นการประมาณ ทนายตรวจทานก่อนบันทึก</p>
        </div>
      </div>
    </section>
  );
}
