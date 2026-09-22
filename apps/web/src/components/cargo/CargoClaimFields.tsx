'use client';

import type { CargoClaimInput } from '@/lib/api';

type CargoTextKey = Exclude<{
  [K in keyof CargoClaimInput]: CargoClaimInput[K] extends string | null | undefined ? K : never
}[keyof CargoClaimInput], undefined>;

type CargoField = { key: CargoTextKey; label: string; placeholder?: string; type?: string; area?: boolean };

const FACT_FIELDS: CargoField[] = [
  { key: 'assuredName', label: 'ผู้เอาประกันภัย' },
  { key: 'shipperName', label: 'ผู้ส่งสินค้า (Shipper)' },
  { key: 'consigneeName', label: 'ผู้รับสินค้า (Consignee)' },
  { key: 'contractingCarrierName', label: 'ผู้ขนส่งตามสัญญา' },
  { key: 'actualCarrierName', label: 'ผู้ขนส่งจริง' },
  { key: 'origin', label: 'ต้นทาง' },
  { key: 'destination', label: 'ปลายทาง' },
  { key: 'transportMode', label: 'วิธีขนส่ง', placeholder: 'เรือ / เครื่องบิน / รถ' },
  { key: 'transportDocumentNumber', label: 'เลข B/L / AWB / ใบรับขน' },
  { key: 'arrivalDate', label: 'วันที่สินค้าถึง', type: 'date' },
  { key: 'lossDate', label: 'วันที่พบความเสียหาย', type: 'date' },
  { key: 'goodsDescription', label: 'รายละเอียดสินค้า' },
  { key: 'movementTerm', label: 'เงื่อนไขการขนส่ง', placeholder: 'เช่น CY/CY, Door to Door' },
  { key: 'damageDescription', label: 'ลักษณะความเสียหาย' },
];

const ANALYSIS_FIELDS: CargoField[] = [
  { key: 'applicableLaw', label: 'กฎหมายที่ใช้บังคับ' },
  { key: 'jurisdiction', label: 'เขตอำนาจ / ศาล' },
  { key: 'liableParty', label: 'ผู้ที่อาจต้องรับผิด' },
  { key: 'liabilityLimit', label: 'ข้อจำกัดความรับผิด' },
  { key: 'liabilityExclusion', label: 'ข้อยกเว้นความรับผิด' },
  { key: 'timeBarPeriod', label: 'อายุความ / Time bar' },
  { key: 'timeBarTriggerDate', label: 'วันที่เริ่มนับ', type: 'date' },
  { key: 'timeBarDeadline', label: 'วันครบกำหนด', type: 'date' },
  { key: 'timeBarBasis', label: 'ฐานกฎหมายและเหตุผลการคำนวณ', area: true },
  { key: 'quantumNotes', label: 'วิเคราะห์จำนวนความเสียหาย', area: true },
  { key: 'recommendation', label: 'ข้อเสนอแนะในการดำเนินการ', area: true },
  { key: 'opinion', label: 'ความเห็นทนาย', area: true },
];

export function CargoClaimFields({
  value,
  onChange,
  mode = 'facts',
}: {
  value: CargoClaimInput;
  onChange: (value: CargoClaimInput) => void;
  mode?: 'facts' | 'analysis';
}) {
  const fields = mode === 'facts' ? FACT_FIELDS : ANALYSIS_FIELDS;
  const set = (key: keyof CargoClaimInput, next: string | number | null) =>
    onChange({ ...value, [key]: next });
  const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <label key={field.key} className={field.area ? 'sm:col-span-2 text-sm font-medium' : 'text-sm font-medium'}>
          {field.label}
          {field.area ? (
            <textarea
              rows={3}
              value={String(value[field.key] ?? '')}
              onChange={(event) => set(field.key, event.target.value)}
              className={`${inputClass} resize-y`}
            />
          ) : (
            <input
              type={field.type ?? 'text'}
              value={field.type === 'date' ? String(value[field.key] ?? '').slice(0, 10) : String(value[field.key] ?? '')}
              placeholder={field.placeholder}
              onChange={(event) => set(field.key, event.target.value || (field.type === 'date' ? null : ''))}
              className={inputClass}
            />
          )}
        </label>
      ))}
      {mode === 'facts' && (
        <>
          <label className="text-sm font-medium">
            น้ำหนักที่เสียหาย
            <input
              type="number"
              min="0"
              step="0.001"
              value={value.damagedWeight ?? ''}
              onChange={(event) => set('damagedWeight', event.target.value ? Number(event.target.value) : null)}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium">
            หน่วยน้ำหนัก
            <input value={value.weightUnit ?? ''} onChange={(event) => set('weightUnit', event.target.value)} className={inputClass} placeholder="kg / MT" />
          </label>
          <label className="text-sm font-medium">
            จำนวนเงินเรียกร้อง
            <input
              type="number"
              min="0"
              step="0.01"
              value={value.claimAmount ?? ''}
              onChange={(event) => set('claimAmount', event.target.value ? Number(event.target.value) : null)}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium">
            สกุลเงิน
            <input value={value.currency ?? ''} onChange={(event) => set('currency', event.target.value.toUpperCase())} className={inputClass} placeholder="THB / USD" />
          </label>
        </>
      )}
    </div>
  );
}
