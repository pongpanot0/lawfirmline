'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileCheck2, ShieldCheck, Upload } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [uploadingRequirementId, setUploadingRequirementId] = useState<string | null>(null);
  const [batchUploading, setBatchUploading] = useState(false);

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
    if (!token || !claim) return false;
    try {
      const updated = caseId
        ? await api.updateCaseCargoRequirement(token, caseId, requirementId, data as never)
        : await api.updateIntakeCargoRequirement(token, intakeId!, requirementId, data as never);
      setClaim({ ...claim, requirements: claim.requirements.map((item) => item.id === requirementId ? { ...item, ...updated } : item) });
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปเดตรายการเอกสารไม่สำเร็จ');
      return false;
    }
  };

  const uploadBatch = async (files: File[]) => {
    if (!token || !caseId || !files.length) return;
    setBatchUploading(true);
    setError('');
    const uploadedIds: string[] = [];
    const failed: string[] = [];
    try {
      for (const file of files) {
        try {
          uploadedIds.push((await api.uploadDocument(token, caseId, file)).id);
        } catch {
          failed.push(file.name);
        }
      }
      setDocuments(await api.getDocuments(token, caseId));
      if (failed.length) setError(`อัปโหลดไม่สำเร็จ ${failed.length} ไฟล์: ${failed.join(', ')}`);
      if (!uploadedIds.length) setError('อัปโหลดเอกสารไม่สำเร็จ');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปโหลดเอกสารไม่สำเร็จ');
    } finally {
      setBatchUploading(false);
    }
  };

  const uploadForRequirement = async (requirementId: string, file: File) => {
    if (!token || !caseId) return;
    setUploadingRequirementId(requirementId);
    setError('');
    try {
      const document = await api.uploadDocument(token, caseId, file);
      setDocuments(await api.getDocuments(token, caseId));
      await updateRequirement(requirementId, { documentId: document.id, status: 'RECEIVED' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'อัปโหลดเอกสารไม่สำเร็จ');
    } finally {
      setUploadingRequirementId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">กำลังโหลด Cargo Claim…</p>;
  if (!claim) return (
    <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
      <FileCheck2 className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-semibold">คดีนี้ยังไม่ได้เปิด Cargo Claim workspace</h2>
      <p className="mt-1 text-sm text-muted-foreground">เปิดเพื่อใช้ Cargo Claim Playbook, checklist เอกสาร และ Time Bar</p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Button className="mt-4" onClick={enable} disabled={saving}>เปิด Cargo Claim</Button>
    </div>
  );

  const requiredItems = claim.requirements.filter((item) => item.required);
  const optionalItems = claim.requirements.filter((item) => !item.required);
  const received = requiredItems.filter((item) => item.status === 'RECEIVED').length;
  const canConfirm = ['OWNER', 'SENIOR_LAWYER', 'LAWYER'].includes(user?.firmRole ?? '');
  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">เอกสาร Cargo Claim</h2>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800">ได้รับ {received} / {requiredItems.length}</span>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${claim.reviewStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
              {claim.reviewStatus === 'CONFIRMED' ? 'ทนายยืนยันแล้ว' : 'รอทนายตรวจ'}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">อัปโหลดจากที่ใดก็ได้ แล้วให้ Jev เสนอหมวดพร้อมหลักฐาน · checklist ปรับตามคดีได้</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void save(false)} disabled={saving}>บันทึกร่าง</Button>
          {canConfirm && <Button onClick={() => void save(true)} disabled={saving}><ShieldCheck className="h-4 w-4" />ยืนยันโดยทนาย</Button>}
        </div>
      </header>

      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)]">
        <div className="space-y-3">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h3 className="font-semibold">รายการที่เลือกใช้</h3><p className="text-xs text-muted-foreground">{requiredItems.length} รายการบังคับใน checklist นี้</p></div>
              {caseId && <div className="flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{batchUploading ? 'กำลังอัปโหลด…' : <><Upload className="h-4 w-4" /> อัปโหลดหลายไฟล์</>}<input className="sr-only" type="file" multiple disabled={batchUploading} onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void uploadBatch(files); event.currentTarget.value = ''; }} /></label>
              </div>}
            </div>
            <div className="divide-y">
              {requiredItems.map((item, index) => (
                <div key={item.id} data-testid="cargo-requirement" className="grid gap-2 py-3 sm:grid-cols-[minmax(9rem,1fr)_7rem_minmax(10rem,1fr)_auto] sm:items-center">
                  <div className="flex items-start gap-2 text-sm font-medium"><label className="flex items-start gap-2"><input type="checkbox" checked={item.required} onChange={(event) => void updateRequirement(item.id, { required: event.target.checked })} className="mt-1" /><span>{item.label}</span></label></div>
                  <span className={`rounded-full px-2 py-1 text-xs ${item.status === 'RECEIVED' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{STATUS_LABELS[item.status]}</span>
                  {item.document ? <span className="truncate text-sm" title={item.document.filename}>{item.document.filename}</span> : <select aria-label={`เลือกไฟล์สำหรับ ${item.label}`} value={item.documentId ?? ''} onChange={(event) => void updateRequirement(item.id, { documentId: event.target.value || null, status: event.target.value ? 'RECEIVED' : item.status })} className="min-h-9 min-w-0 rounded-lg border bg-background px-2 text-sm"><option value="">เลือกไฟล์ที่อัปโหลดแล้ว</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.filename}</option>)}</select>}
                  {caseId && <label className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border px-3 text-sm hover:bg-accent">{uploadingRequirementId === item.id ? 'กำลังอัปโหลด…' : item.document ? 'เปลี่ยน' : <><Upload className="h-3.5 w-3.5" /> เพิ่มไฟล์</>}<input className="sr-only" type="file" disabled={uploadingRequirementId === item.id} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadForRequirement(item.id, file); event.currentTarget.value = ''; }} /></label>}
                </div>
              ))}
            </div>
            {optionalItems.length > 0 && <details className="mt-3 border-t pt-3"><summary className="cursor-pointer text-sm text-muted-foreground">เอกสารอื่น ๆ อีก {optionalItems.length} รายการ · เพิ่มได้ตามความเหมาะสม</summary><div className="mt-2 divide-y">{optionalItems.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={item.required} onChange={(event) => void updateRequirement(item.id, { required: event.target.checked })} />{item.label}</label><span className="text-xs text-muted-foreground">{item.document?.filename ?? STATUS_LABELS[item.status]}</span></div>)}</div></details>}
          </section>
          <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-medium">ข้อเท็จจริงการขนส่ง</summary><div className="pt-4"><CargoClaimFields value={draft} onChange={setDraft} mode="facts" /></div></details>
          <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-medium">Liability / Time Bar · ทนายตรวจ</summary><div className="pt-4"><p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">ข้อมูล AI เป็นร่าง ต้องตรวจแหล่งที่มาและยืนยันก่อนใช้</p><CargoClaimFields value={draft} onChange={setDraft} mode="analysis" />{caseId && <div className="mt-6 space-y-4 border-t pt-6"><BatchAnalysisPanel caseId={caseId} onFieldSuggestions={setSuggestions} entityLabel="Cargo Claim" /><SuggestedFieldsPanel suggestions={suggestions} accepts={CARGO_SUGGEST_FIELDS} current={Object.fromEntries(CARGO_SUGGEST_FIELDS.map((field) => [field, String(draft[field as keyof CargoClaimInput] ?? '')]))} onApply={(field, value) => { const key = field as keyof CargoClaimInput; const parsed = field === 'claimedAmount' || field === 'damagedWeight' ? Number(value) : value; setDraft((current) => ({ ...current, [key]: parsed })); }} /></div>}</div></details>
        </div>
        <aside className="space-y-3 xl:sticky xl:top-4">
          <section className="rounded-xl border bg-card p-4"><h3 className="font-semibold">ยอดและสิทธิเรียกร้อง</h3><dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{[["ยอดเรียกร้อง", draft.claimAmount ? `${draft.currency ?? 'THB'} ${draft.claimAmount}` : 'ยังไม่ระบุ'],["ผู้รับผิด", draft.liableParty || 'รอตรวจ'],["กำหนด Time Bar", draft.timeBarDeadline || 'ยังไม่ระบุ']].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl></section>
          <details className="rounded-xl border bg-card p-4"><summary className="cursor-pointer font-medium">Playbook · แนวทาง</summary><div className="pt-3 text-sm text-muted-foreground">ใช้เป็นแนวทางประกอบการทำงาน รายการและลำดับปรับตามข้อเท็จจริงของคดีได้{claim.playbookRelease && <p className="mt-2 text-xs">{claim.playbookRelease.name} · v{claim.playbookRelease.version}</p>}{!claim.playbookRelease && <Button variant="outline" className="mt-3" onClick={enable} disabled={saving}>ผูก Cargo Playbook</Button>}</div></details>
        </aside>
      </div>
    </div>
  );
}
