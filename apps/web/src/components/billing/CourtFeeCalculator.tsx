'use client';

import { useId, useState } from 'react';
import { Calculator } from 'lucide-react';
import { COURT_FEE_RULE_VERSION, estimateCourtFee, type CourtFeeCaseKind } from '@lawfirm/shared';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { SelectField } from '@/components/ui/form-fields';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { courtFeeNeedsClaim } from './court-fee-fields';

const kinds: [CourtFeeCaseKind, string][] = [
  ['GENERAL', 'คำฟ้องทั่วไป (มีทุนทรัพย์)'], ['NON_MONETARY', 'ไม่มีทุนทรัพย์'],
  ['MIXED', 'มีคำขอทั้งเงินและไม่ใช่เงิน'], ['SMALL_CLAIM', 'มโนสาเร่'],
  ['ARBITRATION_DOMESTIC', 'บังคับคำชี้ขาดอนุญาโตฯ ในประเทศ'],
  ['ARBITRATION_FOREIGN', 'บังคับคำชี้ขาดอนุญาโตฯ ต่างประเทศ'],
  ['MORTGAGE', 'บังคับจำนอง'], ['CONSUMER', 'ผู้บริโภค (ยกเว้น)'],
  ['LABOUR', 'แรงงาน (ยกเว้น)'], ['ADMIN', 'ศาลปกครอง (เรียกเงิน)'], ['BANKRUPTCY', 'ล้มละลาย'],
];
const levels = [['TRIAL', 'ชั้นต้น'], ['APPEAL', 'อุทธรณ์'], ['SUPREME', 'ฎีกา']] as const;

type Level = Parameters<typeof estimateCourtFee>[0]['level'];

export function CourtFeeCalculator({ claimedAmount, onApply }: { claimedAmount?: number | null; onApply: (amount: string) => void }) {
  const id = useId();
  const [kind, setKind] = useState<CourtFeeCaseKind>('GENERAL');
  const [level, setLevel] = useState<Level>('TRIAL');
  const [claim, setClaim] = useState(claimedAmount == null ? '' : String(claimedAmount));
  const needsClaim = courtFeeNeedsClaim(kind);
  const result = !needsClaim || (claim !== '' && Number.isFinite(Number(claim)))
    ? estimateCourtFee({ kind, level, claimAmount: Number(claim) }) : null;

  return <section className="space-y-4 rounded-lg border border-[#E9D7B8] bg-[#FAF5EB] p-4" aria-label="เครื่องคิดค่าขึ้นศาล">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 font-semibold"><Calculator className="h-5 w-5" aria-hidden="true" />เครื่องคิดค่าขึ้นศาล</h3>
      <span className="whitespace-nowrap rounded-full border border-[#E9D7B8] px-2 py-1 text-xs">ประมาณการ</span>
    </div>
    <SelectField label="ประเภทคดี" hint="เลือกประเภทคำขอ" value={kind} onChange={e => setKind(e.target.value as CourtFeeCaseKind)}>
      {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </SelectField>
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">ลำดับชั้นศาล</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-[#eae5dc] p-1">
        {levels.map(([value, label]) => <button key={value} type="button" aria-pressed={level === value} onClick={() => setLevel(value)} className={`h-11 flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${level === value ? 'bg-[#142e43] text-white' : 'text-[#142e43]'}`}>{label}</button>)}
      </div>
      <p className="text-xs text-muted-foreground">เลือกชั้นที่ยื่นคำร้อง</p>
    </fieldset>
    {needsClaim && <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">ทุนทรัพย์ (บาท)</label>
      <MoneyInput id={id} aria-describedby={`${id}-hint`} min={0} value={claim} onValueChange={setClaim} className="h-11 tabular-nums" />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">{level !== 'TRIAL' ? 'ใส่ยอดที่ยังพิพาทในชั้นนี้' : claimedAmount != null ? 'ดึงจากข้อมูลคดี แก้ได้' : 'ใส่ทุนทรัพย์ที่ใช้คำนวณ'}</p>
    </div>}
    {result ? <div className="space-y-3 rounded-lg border border-[#E9D7B8] bg-white p-4" aria-live="polite">
      {result.lines.map((line, index) => <div key={index} className="flex flex-wrap justify-between gap-2 text-sm"><span>{line.label}</span><span className="tabular-nums">{formatCurrency(line.amount)}</span></div>)}
      <p className="border-t pt-3 text-lg font-bold">ค่าขึ้นศาลโดยประมาณ {formatCurrency(result.fee)}</p>
      {result.notes.map(note => <p key={note} className="text-xs text-muted-foreground">{note}</p>)}
      <p className="text-xs text-muted-foreground">คำนวณตาม {COURT_FEE_RULE_VERSION} · ตรวจกับใบเสร็จศาลก่อนยืนยัน</p>
      <div><Button type="button" className="h-11 whitespace-nowrap" disabled={result.fee <= 0} onClick={() => onApply(String(result.fee))}>ใช้ยอดนี้</Button><p className="mt-1 text-xs text-muted-foreground">{result.fee > 0 ? 'เติมยอดลงช่องจำนวนเงิน แก้ได้' : 'ไม่มีค่าขึ้นศาล ไม่ต้องบันทึกค่าใช้จ่ายรายการนี้'}</p></div>
    </div> : <p className="text-sm text-muted-foreground">ใส่ทุนทรัพย์เพื่อดูยอดประมาณการ</p>}
  </section>;
}
