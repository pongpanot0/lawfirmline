'use client';

import { useState } from 'react';
import { InsuranceClaimStage, INSURANCE_CLAIM_STAGE_LABELS, INSURANCE_CLAIM_STAGE_ORDER, POLICY_TYPES, POLICY_TYPE_LABELS } from '@lawfirm/shared';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type ClaimCurrency, type InsuranceClaimItem } from '@/lib/api';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { formatDate } from '@/lib/utils';
import { confirmDialog } from '@/lib/confirm-dialog';
import { InsurerSelect } from '@/components/InsurerSelect';
import { ActionWithHint } from '@/components/ui/ActionWithHint';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

const CURRENCIES: ClaimCurrency[] = ['THB', 'USD', 'EUR'];
const CLAIM_LABELS = {
  insurerName: 'บริษัทประกัน', claimNumber: 'Claim no.', policyNumber: 'Policy no.',
  assuredName: 'Assured (ผู้เอาประกัน)', policyType: 'ชนิดของกรมธรรม์', claimAmount: 'Claim amount (ยอดเรียกร้อง)', incidentDate: 'วันเกิดเหตุ',
};
const TEXT_FIELDS = ['claimNumber', 'policyNumber', 'assuredName'] as const;
const selectClass = 'min-h-11 w-full rounded-md border border-input bg-background px-2 text-sm';

function editValues(claim: InsuranceClaimItem | null) {
  return {
    insurerName: claim?.insurerName ?? '', claimNumber: claim?.claimNumber ?? '', policyNumber: claim?.policyNumber ?? '',
    assuredName: claim?.assuredName ?? '', policyType: claim?.policyType ?? '', claimAmount: claim?.claimAmount?.toString() ?? '',
    claimCurrency: claim?.claimCurrency ?? 'THB', incidentDate: claim?.incidentDate ? bangkokDateInputValue(claim.incidentDate) : '',
  };
}

export function CaseInsurancePanel({ caseId, claim, readOnly, onChanged }: {
  caseId: string; claim: InsuranceClaimItem | null; readOnly: boolean; onChanged: (updated: InsuranceClaimItem) => void;
}) {
  const { token } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => editValues(claim));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const startEdit = () => {
    setForm(editValues(claim));
    setError('');
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting || readOnly || !form.incidentDate || !form.insurerName.trim()) return;
    setSubmitting(true);
    setError('');
    const data = {
      insurerName: form.insurerName.trim(), claimNumber: form.claimNumber.trim() || null, policyNumber: form.policyNumber.trim() || null,
      assuredName: form.assuredName.trim() || null, policyType: POLICY_TYPES.find((value) => value === form.policyType) ?? null,
      claimAmount: form.claimAmount === '' ? null : Number(form.claimAmount), claimCurrency: form.claimCurrency,
    };
    try {
      const updated = claim
        ? await api.updateInsuranceClaim(token, caseId, { ...data, ...(form.incidentDate !== bangkokDateInputValue(claim.incidentDate) ? { incidentDate: form.incidentDate } : {}) })
        : await api.createInsuranceClaim(token, caseId, { ...data, incidentDate: form.incidentDate });
      setEditing(false);
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกข้อมูลเคลมไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvance = async (stage: InsuranceClaimStage) => {
    if (!token || submitting || readOnly) return;
    if (!await confirmDialog(`เปลี่ยนสถานะเป็น “${INSURANCE_CLAIM_STAGE_LABELS[stage]}” และสร้างงานที่เกี่ยวข้องหรือไม่?`)) return;
    setSubmitting(true);
    setError('');
    try {
      onChanged(await api.advanceInsuranceClaimStage(token, caseId, stage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  const values = claim && {
    ...claim,
    policyType: claim.policyType ? POLICY_TYPE_LABELS[claim.policyType] : null,
    claimAmount: claim.claimAmount == null ? null : `${Number(claim.claimAmount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${claim.claimCurrency === 'THB' ? 'บาท' : claim.claimCurrency}`,
    incidentDate: formatDate(claim.incidentDate),
  };
  return (
    <section className="space-y-4 border-y border-border py-4 text-sm" aria-label="ข้อมูลเคลมประกัน">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">ข้อมูลเคลมประกัน</h3>
        {!readOnly && !editing && <ActionWithHint variant="link" className="px-0 underline" hint={claim ? 'แก้ข้อมูลเคลมของคดีนี้' : 'ระบุกรมธรรม์และยอดเรียกร้อง'} disabled={submitting} onClick={startEdit}>
          {claim ? 'แก้ไข' : 'เพิ่มข้อมูลเคลม'}
        </ActionWithHint>}
      </div>
      {values ? (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {(Object.keys(CLAIM_LABELS) as (keyof typeof CLAIM_LABELS)[]).map((field) => (
            <div key={field} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{CLAIM_LABELS[field]}</dt>
              <dd className="break-words font-medium">{values[field] ?? '—'}</dd>
            </div>
          ))}
        </dl>
      ) : <p className="text-muted-foreground">ยังไม่มีข้อมูลเคลมประกันในคดีนี้</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {editing && !readOnly && (
        <form onSubmit={save} className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <h4 className="font-semibold">{claim ? 'แก้ไขข้อมูลเคลมประกัน' : 'เพิ่มข้อมูลเคลมประกัน'}</h4>
          <fieldset disabled={submitting} className="grid items-start gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="claim-insurer">{CLAIM_LABELS.insurerName}</label>
              <InsurerSelect id="claim-insurer" value={form.insurerName} onChange={(insurerName) => setForm({ ...form, insurerName })} />
            </div>
            {TEXT_FIELDS.map((field) => <label key={field} className="grid gap-1">{CLAIM_LABELS[field]}
              <Input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
            </label>)}
            <label className="grid gap-1" htmlFor="claim-policy-type">{CLAIM_LABELS.policyType}
              <Select id="claim-policy-type" className={selectClass} value={form.policyType} onChange={(e) => setForm({ ...form, policyType: e.target.value })}>
                <option value="">ยังไม่ระบุ</option>
                {POLICY_TYPES.map((type) => <option key={type} value={type}>{POLICY_TYPE_LABELS[type]}</option>)}
              </Select>
            </label>
            <div>
              <label htmlFor="claim-amount">{CLAIM_LABELS.claimAmount}</label>
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
                <Input id="claim-amount" type="number" min="0" max="9999999999999.99" step="0.01" value={form.claimAmount} onChange={(e) => setForm({ ...form, claimAmount: e.target.value })} />
                <Select aria-label="สกุลเงิน" className={selectClass} value={form.claimCurrency} onChange={(e) => setForm({ ...form, claimCurrency: e.target.value as ClaimCurrency })}>
                  {CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}
                </Select>
              </div>
            </div>
            <div><p className="mb-1">{CLAIM_LABELS.incidentDate}</p>
              <ThaiDateInput label={CLAIM_LABELS.incidentDate} required value={form.incidentDate} onChange={(incidentDate) => setForm({ ...form, incidentDate })} />
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <ActionWithHint type="submit" hint="ใช้ข้อมูลเคลมที่บันทึก" disabled={submitting || !form.incidentDate || !form.insurerName.trim()}>{submitting ? 'กำลังบันทึก…' : 'บันทึก'}</ActionWithHint>
            <ActionWithHint variant="outline" hint="ปิดฟอร์มและคืนค่าเดิม" disabled={submitting} onClick={() => { setEditing(false); setError(''); }}>ยกเลิก</ActionWithHint>
          </div>
        </form>
      )}
      {claim && !editing && <details className="min-w-0">
        <summary className="cursor-pointer py-2 text-muted-foreground">ขั้นตอนเคลมและวันติดตาม</summary>
        <div className="space-y-4">
          <div>
            <ol aria-label="ขั้นตอนเคลม" className="flex items-center justify-between overflow-x-auto pb-1">
              {INSURANCE_CLAIM_STAGE_ORDER.filter(
                (s) => s !== InsuranceClaimStage.DENIED_OR_PARTIAL || claim.stage === InsuranceClaimStage.DENIED_OR_PARTIAL,
              ).map((stage, i, arr) => {
                const currentIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage);
                const stageIndex = INSURANCE_CLAIM_STAGE_ORDER.indexOf(stage);
                const done = stageIndex <= currentIndex;
                return (
                  <li key={stage} aria-current={stage === claim.stage ? 'step' : undefined} className="flex flex-1 items-center">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </div>
                    <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{INSURANCE_CLAIM_STAGE_LABELS[stage]}</span>
                    {i < arr.length - 1 && <div className="mx-2 h-px min-w-4 flex-1 bg-border" />}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">วันครบอายุความ</p>
              <p className="font-medium text-foreground">
                {claim.limitationDeadline ? formatDate(claim.limitationDeadline) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">กำหนดหนังสือทวงถาม</p>
              <p className="font-medium text-foreground">
                {claim.demandLetterDeadline ? formatDate(claim.demandLetterDeadline) : '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">วันยื่นร้องเรียน คปภ.</p>
              <p className="font-medium text-foreground">
                {claim.oicComplaintDate ? formatDate(claim.oicComplaintDate) : '—'}
              </p>
            </div>
          </div>

          {!readOnly && (
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-foreground">เปลี่ยนสถานะ</p>
              <div className="flex flex-wrap gap-2">
                {INSURANCE_CLAIM_STAGE_ORDER.filter(
                  (s) => INSURANCE_CLAIM_STAGE_ORDER.indexOf(s) > INSURANCE_CLAIM_STAGE_ORDER.indexOf(claim.stage),
                ).map((stage) => (
                  <ActionWithHint hint="ปรับสถานะและงานที่เกี่ยวข้อง"
                    key={stage}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submitting}
                    onClick={() => handleAdvance(stage)}
                  >
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                    {INSURANCE_CLAIM_STAGE_LABELS[stage]}
                  </ActionWithHint>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>}
    </section>
  );
}
