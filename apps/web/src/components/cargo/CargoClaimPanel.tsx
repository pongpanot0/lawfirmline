'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CargoClaimInput, type CargoClaimItem, type DocumentItem, type FieldSuggestion, type SuggestibleField } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CargoClaimFields } from './CargoClaimFields';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';

const STATUS_LABELS = {
  REQUESTED: 'ขอแล้ว',
  RECEIVED: 'ได้รับแล้ว',
  MISSING: 'ยังขาด',
  NOT_APPLICABLE: 'ไม่เกี่ยวข้อง',
} as const;

const CARGO_SUGGEST_FIELDS: SuggestibleField[] = [
  'assuredName', 'shipperName', 'consigneeName', 'contractingCarrierName', 'actualCarrierName',
  'origin', 'destination', 'transportMode', 'transportDocumentNumber', 'arrivalDate', 'lossDate',
  'goodsDescription', 'movementTerm', 'damageDescription', 'damagedWeight', 'claimedAmount', 'currency',
];

const CARGO_INPUT_KEYS: Array<keyof CargoClaimInput> = [
  'assuredName', 'shipperName', 'consigneeName', 'contractingCarrierName', 'actualCarrierName',
  'origin', 'destination', 'transportMode', 'transportDocumentNumber', 'arrivalDate', 'lossDate',
  'goodsDescription', 'movementTerm', 'damageDescription', 'damagedWeight', 'weightUnit', 'claimAmount', 'currency',
  'applicableLaw', 'jurisdiction', 'liableParty', 'liabilityLimit', 'liabilityExclusion', 'timeBarPeriod',
  'timeBarTriggerDate', 'timeBarDeadline', 'timeBarBasis', 'quantumNotes', 'recommendation', 'opinion',
];

function editableValues(source: CargoClaimInput): CargoClaimInput {
  return Object.fromEntries(
    CARGO_INPUT_KEYS.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  ) as CargoClaimInput;
}

export function CargoClaimPanel({ caseId, intakeId }: { caseId?: string; intakeId?: string }) {
  const { token, user } = useAuth();
  const [claim, setClaim] = useState<CargoClaimItem | null>(null);
  const [draft, setDraft] = useState<CargoClaimInput>({});
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [section, setSection] = useState<'facts' | 'checklist' | 'analysis'>('facts');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);

  const load = useCallback(async () => {
    if (!token || (!caseId && !intakeId)) return;
    setLoading(true);
    setError('');
    try {
      const result = caseId
        ? await api.getCaseCargoClaim(token, caseId)
        : await api.getIntakeCargoClaim(token, intakeId!);
      setClaim(result);
      setDraft(result ? editableValues(result) : {});
      const docs = caseId ? await api.getDocuments(token, caseId) : await api.getIntakeDocuments(token, intakeId!);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'โหลด Cargo Claim ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [token, caseId, intakeId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (confirm = false) => {
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const result = caseId
        ? await api.updateCaseCargoClaim(token, caseId, { ...editableValues(draft), confirm })
        : await api.updateIntakeCargoClaim(token, intakeId!, { ...editableValues(draft), confirm });
      setClaim(result);
      setDraft(editableValues(result));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const enable = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const result = caseId
        ? await api.enableCaseCargoClaim(token, caseId)
        : await api.enableIntakeCargoClaim(token, intakeId!);
      setClaim(result);
      setDraft(editableValues(result));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เปิด Cargo workspace ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const updateRequirement = async (requirementId: string, data: Record<string, unknown>) => {
    if (!token || !claim) return;
    try {
      const updated = caseId
        ? await api.updateCaseCargoRequirement(token, caseId, requirementId, data as never)
        : await api.updateIntakeCargoRequirement(token, intakeId!, requirementId, data as never);
      setClaim({ ...claim, requirements: claim.requirements.map((item) => item.id === requirementId ? { ...item, ...updated } : item) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตรายการเอกสารไม่สำเร็จ');
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">กำลังโหลด Cargo Claim…</p>;
  if (!claim) return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
      <FileCheck2 className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-semibold">คดีนี้ยังไม่ได้เปิด Cargo Claim workspace</h2>
      <p className="mt-1 text-sm text-muted-foreground">เปิดเพื่อใช้ข้อเท็จจริงเฉพาะทาง, checklist 16 รายการ และ Time Bar</p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Button className="mt-4" onClick={enable} disabled={saving}>เปิด Cargo Claim</Button>
    </div>
  );

  const received = claim.requirements.filter((item) => item.status === 'RECEIVED').length;
  const canConfirm = ['OWNER', 'SENIOR_LAWYER', 'LAWYER'].includes(user?.firmRole ?? '');
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Cargo Claim Workbench</h2>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${claim.reviewStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {claim.reviewStatus === 'CONFIRMED' ? 'ทนายยืนยันแล้ว' : 'ฉบับรอตรวจ'}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">ข้อเท็จจริง → เอกสาร {received}/16 → Liability & Time Bar → ทนายยืนยัน</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void save(false)} disabled={saving}>บันทึกร่าง</Button>
          {canConfirm && <Button onClick={() => void save(true)} disabled={saving}><ShieldCheck className="h-4 w-4" />ยืนยันโดยทนาย</Button>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <div className="flex gap-1 overflow-x-auto rounded-xl border bg-muted/30 p-1" role="tablist">
        {([
          ['facts', 'ข้อเท็จจริงการขนส่ง'],
          ['checklist', `เอกสาร 16 รายการ (${received}/16)`],
          ['analysis', 'Liability / Time Bar'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={`min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-medium ${section === id ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground'}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        {section === 'facts' && <CargoClaimFields value={draft} onChange={setDraft} mode="facts" />}
        {section === 'analysis' && (
          <div>
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              ข้อมูลที่ AI ช่วยสกัดหรือคำนวณเป็นเพียงร่าง ต้องมีแหล่งอ้างอิงและทนายกดยืนยันก่อนใช้ดำเนินการ
            </div>
            <CargoClaimFields value={draft} onChange={setDraft} mode="analysis" />
            {caseId && (
              <div className="mt-6 space-y-4 border-t pt-6">
                <BatchAnalysisPanel caseId={caseId} onFieldSuggestions={setSuggestions} entityLabel="Cargo Claim" />
                <SuggestedFieldsPanel
                  suggestions={suggestions}
                  accepts={CARGO_SUGGEST_FIELDS}
                  current={Object.fromEntries(CARGO_SUGGEST_FIELDS.map((field) => [field, String(draft[field as keyof CargoClaimInput] ?? '')]))}
                  onApply={(field, value) => {
                    const key = field as keyof CargoClaimInput;
                    const parsed = field === 'claimedAmount' || field === 'damagedWeight' ? Number(value) : value;
                    setDraft((current) => ({ ...current, [key]: parsed }));
                  }}
                />
              </div>
            )}
          </div>
        )}
        {section === 'checklist' && (
          <div className="space-y-3">
            {claim.requirements.map((item, index) => (
              <div key={item.id} data-testid="cargo-requirement" className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[2rem_minmax(12rem,1fr)_9rem_minmax(12rem,1fr)] lg:items-center">
                <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
                <div>
                  <label className="flex items-start gap-2 text-sm font-medium">
                    <input type="checkbox" checked={item.required} onChange={(event) => void updateRequirement(item.id, { required: event.target.checked })} className="mt-1" />
                    {item.label}
                  </label>
                  {item.document && <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Source: {item.document.filename}</p>}
                </div>
                <select value={item.status} onChange={(event) => void updateRequirement(item.id, { status: event.target.value })} className="min-h-10 rounded-lg border bg-background px-2 text-sm">
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={item.documentId ?? ''} onChange={(event) => void updateRequirement(item.id, { documentId: event.target.value || null, status: event.target.value ? 'RECEIVED' : item.status })} className="min-h-10 min-w-0 rounded-lg border bg-background px-2 text-sm">
                  <option value="">— ผูกไฟล์ต้นฉบับ —</option>
                  {documents.map((document) => <option key={document.id} value={document.id}>{document.filename}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
