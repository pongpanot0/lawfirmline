'use client';

import { CASE_NUMBER_HINT, CASE_NUMBER_HTML, CourtLevel, COURT_LEVEL_LABELS, FEE_MAX } from '@lawfirm/shared';
import type { CaseDetail, CaseTypeItem, ClientItem, CourtItem } from '@/lib/api';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';

export interface CaseOverviewCustomerValue {
  customerId: string;
  contactId: string;
  sharePercent: string;
  isPrimary: boolean;
  note: string;
}

export interface CaseOverviewValues {
  title: string; ownRef: string; customerRef: string; caseTypeId: string;
  blackCaseNumber: string; redCaseNumber: string; courtLevel: string; courtName: string;
  partyRole: string; claimedAmount: string; chargeSection: string; estimatedFee: string; description: string;
  clientId: string; clientName: string; customers: CaseOverviewCustomerValue[];
}

export function CaseOverviewForm({ value, onChange, legalCase, caseTypes, courts, clients, onClientCreated, saving, error, onSave, onCancel }: {
  value: CaseOverviewValues;
  onChange: (value: CaseOverviewValues) => void;
  legalCase: CaseDetail;
  caseTypes: CaseTypeItem[];
  courts: CourtItem[];
  clients: ClientItem[];
  onClientCreated: (client: ClientItem) => void;
  saving: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (key: Exclude<keyof CaseOverviewValues, 'customers'>, next: string) => onChange({ ...value, [key]: next });
  const input = 'mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const group = 'grid min-w-0 gap-4 border-b border-border pb-5 sm:grid-cols-2';

  return <form className="col-span-full min-w-0" data-testid="case-information-edit" onSubmit={e => { e.preventDefault(); onSave(); }}>
    <p className="mb-5 text-sm text-muted-foreground">แก้ไขข้อมูลคดี ลูกความ และผู้ว่าจ้างได้จากที่นี่</p>
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
      <section className={group} aria-labelledby="case-people-heading">
        <div className="sm:col-span-2"><h3 id="case-people-heading" className="text-base font-bold tracking-tight">ลูกความและผู้ว่าจ้าง</h3><p className="mt-1 text-xs text-muted-foreground">ลูกความคือฝ่ายที่สำนักงานว่าความให้ ส่วนผู้ว่าจ้างคือผู้ติดต่อหรือผู้ชำระค่าบริการ</p></div>
        <label className="text-sm sm:col-span-2">ลูกความ<input list="case-client-options" value={value.clientName} onChange={e => {
          const clientName = e.target.value;
          const match = clients.find(client => client.name.trim().toLocaleLowerCase() === clientName.trim().toLocaleLowerCase());
          onChange({ ...value, clientId: match?.id ?? '', clientName });
        }} className={input} placeholder="ค้นหาหรือพิมพ์ชื่อลูกความ" /><datalist id="case-client-options">{clients.map(client => <option key={client.id} value={client.name} />)}</datalist></label>
        <div className="space-y-3 text-sm sm:col-span-2">
          {value.customers.map((customer, index) => {
            const contacts = clients.find(client => client.id === customer.customerId)?.contacts ?? [];
            return <div key={`${customer.customerId}-${index}`} className={`grid min-w-0 items-end gap-x-2 gap-y-2 ${value.customers.length > 1 ? 'grid-cols-[minmax(0,1fr)_5rem_auto]' : 'grid-cols-1'}`}>
              <CustomerSelect id={`overview-customer-${index}`} label={`ผู้ว่าจ้างรายที่ ${index + 1}`} value={customer.customerId} clients={clients} onChange={customerId => onChange({ ...value, customers: value.customers.map((row, i) => i === index ? { ...row, customerId, contactId: '' } : row) })} onCreated={onClientCreated} />
              {value.customers.length > 1 && <label className="block min-w-0 text-xs text-muted-foreground">สัดส่วน (%)<input type="number" min="0" max="100" value={customer.sharePercent} onChange={e => onChange({ ...value, customers: value.customers.map((row, i) => i === index ? { ...row, sharePercent: e.target.value } : row) })} className="mt-1 h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-center text-sm" /></label>}
              {value.customers.length > 1 && <Button type="button" variant="ghost" size="icon" aria-label={`ลบผู้ว่าจ้างรายที่ ${index + 1}`} onClick={() => onChange({ ...value, customers: value.customers.filter((_, i) => i !== index) })}><X className="h-4 w-4" /></Button>}
              {contacts.length > 0 && <label className="col-span-full block min-w-0 text-xs text-muted-foreground">ผู้ติดต่อ<select aria-label={`ผู้ติดต่อผู้ว่าจ้างรายที่ ${index + 1}`} value={customer.contactId} onChange={e => onChange({ ...value, customers: value.customers.map((row, i) => i === index ? { ...row, contactId: e.target.value } : row) })} className={input}><option value="">ยังไม่ระบุ</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label>}
            </div>;
          })}
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...value, customers: [...value.customers, { customerId: '', contactId: '', sharePercent: '', isPrimary: false, note: '' }] })}><Plus className="h-3.5 w-3.5" /> เพิ่มผู้ว่าจ้าง</Button>
        </div>
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
