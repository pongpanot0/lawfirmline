'use client';
import type { Lang } from '@/lib/marketing/i18n';
import { useState } from 'react';
import { estimateCourtFee, type CourtFeeCaseKind } from '@lawfirm/shared';

const copy = {
  th: {
    s0: 'ค่าธรรมเนียมศาล คิดตามตาราง 1 ท้าย ป.วิ.พ.',
    s1: 'ตอนบันทึกค่าใช้จ่าย เลือกประเภทคดีและใส่ทุนทรัพย์ ระบบคำนวณค่าธรรมเนียมศาลเบื้องต้นให้\n            ลองพิมพ์ตัวเลขดูได้เลย',
    s2: 'คดีมีทุนทรัพย์: ร้อยละ 2 ของส่วนที่ไม่เกิน 50 ล้านบาท (สูงสุด 200,000 บาท) บวกร้อยละ 0.1 ของส่วนที่เกิน ·\n            คดีผู้บริโภคและคดีแรงงานได้รับยกเว้น',
    s3: 'ทุนทรัพย์ (บาท)',
    s4: 'ประเภทคดี',
    s5: 'คดีแพ่งทั่วไป (มีทุนทรัพย์)',
    s6: 'คดีผู้บริโภค',
    s7: 'คดีแรงงาน',
    s8: 'ค่าธรรมเนียมศาลโดยประมาณ',
    s9: 'บาท',
    s10: 'ตัวเลขเป็นการประมาณ ทนายตรวจทานก่อนบันทึก',
  },
  en: {
    s0: 'Court fees from Schedule 1 of the Civil Procedure Code',
    s1: 'When you record an expense, choose the case type and enter the amount in dispute, and Samnuan estimates the court fee. Try typing a number.',
    s2: 'Cases with an amount in dispute: 2% of the amount up to THB 50 million (capped at THB 200,000), plus 0.1% of any excess · Consumer and labour cases are exempt',
    s3: 'Amount in dispute (THB)',
    s4: 'Case type',
    s5: 'General civil case',
    s6: 'Consumer case',
    s7: 'Labour case',
    s8: 'Estimated court fee',
    s9: 'THB',
    s10: 'This is an estimate. A lawyer reviews it before saving.',
  },
};
export function CourtFeeEstimator({ lang = 'th' }: { lang?: Lang } = {}) {
  const c = copy[lang];
  const [amount, setAmount] = useState('1500000');
  const [kind, setKind] = useState<CourtFeeCaseKind>('GENERAL');
  const fee = estimateCourtFee({ kind, level: 'TRIAL', claimAmount: Number(amount) || 0 }).fee;
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-20 md:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-3xl font-semibold leading-snug md:text-4xl">{c.s0}</h2>
          <p className="mt-4 leading-relaxed text-mk-ink-2">{c.s1}</p>
          <p className="mt-4 rounded-lg border border-mk-rule bg-mk-surface p-4 text-sm leading-relaxed text-mk-ink-2">
            {c.s2}
          </p>
        </div>
        <div className="rounded-xl border border-mk-rule bg-mk-surface p-6">
          <label htmlFor="fee-amount" className="block text-sm text-mk-ink-2">
            {c.s3}
          </label>
          <input
            id="fee-amount"
            inputMode="numeric"
            value={amount ? Number(amount).toLocaleString(lang === 'th' ? 'th-TH' : 'en-US') : ''}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 15))}
            className="mt-1 w-full rounded-lg border border-mk-rule bg-mk-paper px-4 py-3 text-lg tabular-nums text-mk-ink"
          />
          <label htmlFor="fee-kind" className="mt-4 block text-sm text-mk-ink-2">
            {c.s4}
          </label>
          <select
            id="fee-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as CourtFeeCaseKind)}
            className="mt-1 w-full rounded-lg border border-mk-rule bg-mk-paper px-4 py-3 text-mk-ink"
          >
            <option value="GENERAL">{c.s5}</option>
            <option value="CONSUMER">{c.s6}</option>
            <option value="LABOUR">{c.s7}</option>
          </select>
          <div className="mt-6 rounded-lg bg-mk-sunk p-4">
            <p className="text-xs text-mk-ink-2">{c.s8}</p>
            <p className="font-display text-3xl font-semibold tabular-nums">
              {lang === 'en' && <span className="text-base">{c.s9} </span>}
              {fee.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US')}
              {lang === 'th' && (
                <>
                  {' '}
                  <span className="text-base">{c.s9}</span>
                </>
              )}
            </p>
          </div>
          <p className="mt-3 text-xs text-mk-ink-2">{c.s10}</p>
        </div>
      </div>
    </section>
  );
}
