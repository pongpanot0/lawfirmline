'use client';

import { CASE_NUMBER_HINT, CASE_NUMBER_HTML, CourtLevel, COURT_LEVEL_LABELS, FEE_MAX } from '@lawfirm/shared';
import type { CaseDetail, CaseTypeItem, CourtItem } from '@/lib/api';
import { Button } from '@/components/ui/button';

export interface CaseOverviewValues {
  title: string; ownRef: string; customerRef: string; caseTypeId: string;
  blackCaseNumber: string; redCaseNumber: string; courtLevel: string; courtName: string;
  partyRole: string; claimedAmount: string; chargeSection: string; estimatedFee: string; description: string;
}

export function CaseOverviewForm({ value, onChange, legalCase, caseTypes, courts, saving, error, onSave, onCancel }: {
  value: CaseOverviewValues;
  onChange: (value: CaseOverviewValues) => void;
  legalCase: CaseDetail;
  caseTypes: CaseTypeItem[];
  courts: CourtItem[];
  saving: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (key: keyof CaseOverviewValues, next: string) => onChange({ ...value, [key]: next });
  const input = 'mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const group = 'grid min-w-0 gap-4 border-b border-border pb-5 sm:grid-cols-2';

  return <form className="col-span-full min-w-0" data-testid="case-information-edit" onSubmit={e => { e.preventDefault(); onSave(); }}>
    <p className="mb-5 text-sm text-muted-foreground">เติมข้อมูลเท่าที่ทราบ ช่องที่มี * จำเป็นต้องกรอก เพิ่มและแก้ไขคู่ความได้ด้านล่างในข้อมูลคดี</p>
    <fieldset disabled={saving} className="min-w-0 space-y-5">
      <section className={group} aria-labelledby="case-basic-heading">
        <h3 id="case-basic-heading" className="font-semibold sm:col-span-2">ข้อมูลหลักของคดี</h3>
        <label className="text-sm sm:col-span-2">ชื่อคดี *<input autoFocus required value={value.title} onChange={e => set('title', e.target.value)} className={input} /></label>
        <label className="text-sm">ประเภทคดี<select value={value.caseTypeId} onChange={e => set('caseTypeId', e.target.value)} className={input}>
          <option value="" disabled={!!legalCase.caseType}>ยังไม่ระบุ</option>
          {legalCase.caseType && !caseTypes.some(t => t.id === legalCase.caseType?.id) && <option value={legalCase.caseType.id}>{legalCase.caseType.name}</option>}
          {caseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <label className="text-sm">ฝ่ายที่สำนักงานเป็นทนายให้<select value={value.partyRole} onChange={e => set('partyRole', e.target.value)} className={input}><option value="">ยังไม่ระบุ</option><option value="PLAINTIFF">โจทก์ (ฝ่ายเราฟ้อง)</option><option value="DEFENDANT">จำเลย (ฝ่ายเราถูกฟ้อง)</option></select></label>
        <label className="text-sm sm:col-span-2">ข้อหาหรือฐานความผิด<textarea rows={2} maxLength={2000} value={value.chargeSection} onChange={e => set('chargeSection', e.target.value)} placeholder="เช่น ละเมิด เรียกค่าเสียหาย / ผิดสัญญา" className={input} /><span className="mt-1 block text-xs text-muted-foreground">ระบุเรื่องที่ฟ้องหรือฐานความผิด ใช้ในคำฟ้องหน้าแรกและปกสำนวน</span></label>
        <label className="text-sm sm:col-span-2">รายละเอียดและข้อเท็จจริงคดี<textarea rows={4} value={value.description} onChange={e => set('description', e.target.value)} placeholder="สรุปเหตุการณ์และประเด็นสำคัญของคดี" className={input} /></label>
      </section>
      <section className={group} aria-labelledby="case-court-heading">
        <div className="sm:col-span-2"><h3 id="case-court-heading" className="font-semibold">ศาลและหมายเลขคดี</h3><p className="mt-1 text-xs text-muted-foreground">ยังไม่ยื่นฟ้องหรือยังไม่มีเลขคดี เว้นว่างไว้ได้</p></div>
        <label className="text-sm">ระดับศาล<select value={value.courtLevel} onChange={e => set('courtLevel', e.target.value)} className={input}><option value="">ยังไม่ระบุ</option>{Object.values(CourtLevel).map(level => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}</select></label>
        <label className="text-sm">ศาล<select value={value.courtName} onChange={e => set('courtName', e.target.value)} className={input}><option value="">ยังไม่ระบุ</option>{courts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}{value.courtName && !courts.some(c => c.name === value.courtName) && <option value={value.courtName}>{value.courtName}</option>}</select></label>
        <label className="text-sm">หมายเลขคดีดำ<input value={value.blackCaseNumber} onChange={e => set('blackCaseNumber', e.target.value)} placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} className={input} /></label>
        <label className="text-sm">หมายเลขคดีแดง<input value={value.redCaseNumber} onChange={e => set('redCaseNumber', e.target.value)} placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} className={input} /></label>
      </section>
      <section className={group} aria-labelledby="case-reference-heading">
        <h3 id="case-reference-heading" className="font-semibold sm:col-span-2">เลขอ้างอิงและจำนวนเงิน</h3>
        <label className="text-sm">เลขอ้างอิงสำนักงาน *<input required value={value.ownRef} onChange={e => set('ownRef', e.target.value)} className={input} /></label>
        <label className="text-sm">เลขอ้างอิงลูกค้า (ผู้ว่าจ้าง)<input value={value.customerRef} onChange={e => set('customerRef', e.target.value)} className={input} /></label>
        <label className="text-sm">ทุนทรัพย์ (บาท)<input type="number" min="0" max={FEE_MAX} step="0.01" value={value.claimedAmount} onChange={e => set('claimedAmount', e.target.value)} className={input} /><span className="mt-1 block text-xs text-muted-foreground">จำนวนเงินที่เรียกร้องในคดี</span></label>
        <label className="text-sm">ค่าจ้างทนายโดยประมาณ (บาท)<input type="number" min="0" max={FEE_MAX} step="0.01" value={value.estimatedFee} onChange={e => set('estimatedFee', e.target.value)} className={input} /><span className="mt-1 block text-xs text-muted-foreground">รายได้ของสำนักงาน แยกจากทุนทรัพย์</span></label>
      </section>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 bg-card py-3">
        <Button type="submit" disabled={saving}>{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูลคดี'}</Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>ยกเลิกการแก้ไข</Button>
      </div>
    </fieldset>
  </form>;
}
