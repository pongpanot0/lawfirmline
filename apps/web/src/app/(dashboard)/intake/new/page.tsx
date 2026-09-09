'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ClientItem, ApiError, IntakeItem, CaseItem, FieldSuggestion } from '@/lib/api';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { getCaseStatusDisplay } from '@/lib/case-status';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';

const REFERRAL_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: 'บุคคลทั่วไป',
  LAWYER: 'ทนายความ',
  HOSPITAL: 'โรงพยาบาล',
  COMPANY: 'บริษัท',
  GOVERNMENT: 'หน่วยงานรัฐ',
  OTHER: 'อื่นๆ',
};

const REFERRAL_CHANNEL_LABELS: Record<string, string> = {
  WALK_IN: 'มาติดต่อด้วยตนเอง',
  PHONE: 'โทรศัพท์',
  EMAIL: 'อีเมล',
  LINE: 'LINE',
  REFERRAL: 'แนะนำ',
  OTHER: 'อื่นๆ',
};

const MATTER_TYPE_LABELS: Record<string, string> = {
  CIVIL: 'แพ่ง',
  CRIMINAL: 'อาญา',
  ADMINISTRATIVE: 'ปกครอง',
  MEDICAL: 'ทางการแพทย์',
  LABOR: 'แรงงาน',
  OTHER: 'อื่นๆ',
};

const PRE_LITIGATION_TYPE_LABELS: Record<string, string> = {
  GENERAL: 'ทั่วไป',
  MEDICAL_CLAIM: 'แพทย์ / ค่าสินไหม',
  TRANSPORT: 'ขนส่ง',
};

const DEFAULT_PRE_LITIGATION_STATUS: Record<string, string> = {
  GENERAL: 'NOTICE_TO_SEND',
  MEDICAL_CLAIM: 'NOTICE_TO_SEND',
  TRANSPORT: 'NOTICE_TO_SEND',
};

export default function NewIntakePage() {
  const { token } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const clientRequest = useRef(0);
  const submitLock = useRef(false);
  const [clientsError, setClientsError] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsRetry, setClientsRetry] = useState(0);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [createdIntakeId, setCreatedIntakeId] = useState<string | null>(null);
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  const [form, setForm] = useState({
    title: '',
    referralType: 'INDIVIDUAL',
    referralChannel: 'WALK_IN',
    referralName: '',
    clientId: '',
    clientContactId: '',
    clientName: '',
    matterType: '',
    opposingParty: '',
    incidentDate: '',
    description: '',
    estimatedDamage: '',
    receivedDate: today,
    relatedCaseId: '',
    isOngoingElsewhere: false,
    externalCaseNumber: '',
    currentStageNote: '',
    preLitigationType: 'GENERAL',
    preLitigationStatus: 'NOTICE_TO_SEND',
    preLitigationNotes: '',
  });
  const [clientCases, setClientCases] = useState<CaseItem[]>([]);
  /**
   * Values the documents state. Re-analysing replaces these, never the form —
   * what a lawyer typed or accepted stays put.
   */
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setClientsLoading(true);
    setClientsError(false);
    api.getClients(token).then((items) => { if (active) setClients(items); })
      .catch(() => { if (active) setClientsError(true); })
      .finally(() => { if (active) setClientsLoading(false); });
    return () => { active = false; };
  }, [token, clientsRetry]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const selectedClient = clients.find((c) => c.id === form.clientId) ?? null;

  const handleClientChange = (clientId: string) => {
    const request = ++clientRequest.current;
    const client = clients.find((item) => item.id === clientId);
    const contact = client?.contacts.find((item) => item.isPrimary) ?? (client?.contacts.length === 1 ? client.contacts[0] : undefined);
    setForm((f) => ({ ...f, clientId, clientContactId: contact?.id ?? '', referralName: contact?.name ?? '', relatedCaseId: '' }));
    setClientCases([]);
    setCasesError(false);
    setCasesLoading(!!clientId);
    if (clientId && token) {
      api.getClient(token, clientId)
        .then((full) => { if (request === clientRequest.current) setClientCases(full.cases ?? []); })
        .catch(() => { if (request === clientRequest.current) setCasesError(true); })
        .finally(() => { if (request === clientRequest.current) setCasesLoading(false); });
    }
  };

  const handleContactChange = (contactId: string) => {
    const client = clients.find((c) => c.id === form.clientId);
    const contact = client?.contacts.find((c) => c.id === contactId);
    const name = contact ? `${contact.name}${(contact as any).nickname ? ` (${(contact as any).nickname})` : ''}` : '';
    setForm((f) => ({ ...f, clientContactId: contactId, referralName: name }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitLock.current) return;
    if (!form.title.trim()) {
      setError('กรุณาระบุชื่อเรื่องสั้นๆ ก่อนบันทึก');
      document.getElementById('intake-title')?.focus();
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        referralType: form.referralType,
        referralChannel: form.referralChannel,
        referralName: form.referralName || undefined,
        matterType: form.matterType || undefined,
        opposingParty: form.opposingParty || undefined,
        incidentDate: form.incidentDate || undefined,
        description: form.description || undefined,
        estimatedDamage: form.estimatedDamage ? parseFloat(form.estimatedDamage) : undefined,
        receivedDate: form.receivedDate,
        relatedCaseId: form.relatedCaseId || undefined,
        isOngoingElsewhere: form.isOngoingElsewhere,
        externalCaseNumber: form.isOngoingElsewhere ? (form.externalCaseNumber || undefined) : undefined,
        currentStageNote: form.isOngoingElsewhere ? (form.currentStageNote || undefined) : undefined,
        preLitigationType: form.preLitigationType,
        preLitigationStatus: form.preLitigationStatus,
        preLitigationNotes: form.preLitigationNotes || undefined,
      };
      if (form.clientId) {
        payload.clientId = form.clientId;
      } else if (form.clientName.trim()) {
        payload.clientName = form.clientName.trim();
      }
      const created = createdIntakeId
        ? { id: createdIntakeId }
        : ((await api.createIntake(token, payload)) as IntakeItem);
      setCreatedIntakeId(created.id);
      const failedFiles: File[] = [];
      for (const file of files) {
        try {
          await api.uploadIntakeDocument(token, created.id, file);
        } catch {
          failedFiles.push(file);
        }
      }
      setFiles(failedFiles);
      if (failedFiles.length) {
        setError(`บันทึกเรื่องแล้ว แต่แนบไฟล์ไม่สำเร็จ ${failedFiles.length} ไฟล์ (รองรับเฉพาะ PDF) กดอีกครั้งเพื่อแนบไฟล์ที่เหลือ โดยไม่บันทึกซ้ำ`);
        submitLock.current = false;
        setSubmitting(false);
        return;
      }
      router.push(`/intake/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl pb-20">
      <h1 className="mb-1 text-2xl font-bold">รับเรื่องใหม่</h1>
      <p className="mb-6 text-sm text-muted-foreground">เริ่มจากชื่อเรื่อง ข้อมูลอื่นเติมภายหลังได้ แนบไฟล์ที่ลูกค้าส่งมาแล้ววิเคราะห์ร่วมกันได้เลย</p>

      <div className="mb-5">
        <BatchAnalysisPanel
          files={files}
          onFilesChange={setFiles}
          onBusyChange={setAnalysisBusy}
          onFieldSuggestions={setSuggestions}
          entityLabel="เรื่อง"
          disabled={submitting || !!createdIntakeId}
          onUseSummary={(summary) =>
            setForm((previous) => ({
              ...previous,
              description: [previous.description, summary].filter(Boolean).join('\n\n'),
            }))
          }
        />
      </div>

      {suggestions.length > 0 && (
        <div className="mb-5">
          <SuggestedFieldsPanel
            suggestions={suggestions}
            accepts={['title', 'opposingParty', 'incidentDate', 'estimatedDamage']}
            current={{
              title: form.title,
              opposingParty: form.opposingParty,
              incidentDate: form.incidentDate,
              estimatedDamage: form.estimatedDamage,
            }}
            onApply={(field, value) =>
              setForm((previous) => ({
                ...previous,
                [field]:
                  field === 'incidentDate' ? bangkokDateInputValue(value) : value,
              }))
            }
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-4 sm:p-6 shadow-sm">
        <fieldset disabled={submitting} className="min-w-0 space-y-6">
        {/* ชื่อเรื่อง */}
        <div>
          <label htmlFor="intake-title" className="block text-sm font-medium">ชื่อเรื่อง *</label>
          <input id="intake-title"
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="เช่น เรียกเงินคืนจากผู้รับเหมา"
          />
        </div>

        {/* ลูกค้า */}
        <div className="space-y-3">
          <h2 className="font-semibold">ลูกค้า</h2>
          <div>
            <label htmlFor="intake-clientId" className="block text-sm font-medium">ลูกค้าในระบบ (ถ้ามี)</label>
            <select id="intake-clientId"
              value={form.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">ลูกค้าใหม่ / ยังไม่ระบุ</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {clientsLoading && <p role="status" className="text-sm text-muted-foreground">กำลังโหลดรายชื่อลูกค้า…</p>}
          {clientsError && <p role="alert" className="text-sm text-destructive">โหลดลูกค้าไม่สำเร็จ <button type="button" className="underline" onClick={() => setClientsRetry((value) => value + 1)}>ลองใหม่</button></p>}
          {casesLoading && <p role="status" className="text-sm text-muted-foreground">กำลังค้นหาคดีเดิมของลูกค้า…</p>}
          {casesError && <p role="alert" className="text-sm text-destructive">โหลดคดีเดิมไม่สำเร็จ <button type="button" className="underline" onClick={() => handleClientChange(form.clientId)}>ลองใหม่</button></p>}
          {form.clientId && selectedClient && (
            <div>
              <label htmlFor="intake-clientContactId" className="block text-sm font-medium">บุคคลติดต่อ / ผู้ส่งเรื่อง (ถ้ามี)</label>
              <select id="intake-clientContactId"
                value={form.clientContactId}
                onChange={(e) => handleContactChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">กรอกชื่อผู้ส่งเอง / ยังไม่ทราบ</option>
                {selectedClient.contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{(c as any).nickname ? ` (${(c as any).nickname})` : ''}{c.isPrimary ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {form.clientContactId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ชื่อผู้ส่งเรื่องจะถูกกรอกอัตโนมัติ: <span className="font-medium">{form.referralName}</span>
                </p>
              )}
            </div>
          )}
          {!form.clientId && (
            <div>
              <label htmlFor="intake-clientName" className="block text-sm font-medium">ชื่อลูกค้า (ถ้ายังไม่มีในระบบ)</label>
              <input id="intake-clientName"
                value={form.clientName}
                onChange={(e) => set('clientName', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
              />
            </div>
          )}
          {form.clientId && clientCases.length > 0 && (
            <div>
              <label htmlFor="intake-relatedCaseId" className="block text-sm font-medium">ผูกกับคดีที่มีอยู่แล้ว (ถ้าเรื่องนี้เกี่ยวกับคดีเดิม)</label>
              <select id="intake-relatedCaseId"
                value={form.relatedCaseId}
                onChange={(e) => set('relatedCaseId', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">-- ไม่ผูกกับคดีเดิม (เรื่องใหม่) --</option>
                {clientCases.map((c) => (
                  <option key={c.id} value={c.id}>{c.ownRef} — {c.title} ({getCaseStatusDisplay(c.status).label})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* รายละเอียดเรื่อง */}
        <div className="space-y-3">
          <h2 className="font-semibold">รายละเอียดเรื่อง</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="intake-matterType" className="block text-sm font-medium">ประเภทเรื่อง</label>
              <select id="intake-matterType"
                value={form.matterType}
                onChange={(e) => set('matterType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">ยังไม่ทราบประเภทเรื่อง</option>
                {Object.entries(MATTER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="intake-opposingParty" className="block text-sm font-medium">คู่กรณี</label>
              <input id="intake-opposingParty"
                value={form.opposingParty}
                onChange={(e) => set('opposingParty', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="ชื่อคู่กรณี"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="intake-incidentDate" className="block text-sm font-medium">วันเกิดเหตุ</label>
              <input id="intake-incidentDate"
                type="date"
                value={form.incidentDate}
                onChange={(e) => set('incidentDate', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="intake-estimatedDamage" className="block text-sm font-medium">ความเสียหายโดยประมาณ (บาท)</label>
              <input id="intake-estimatedDamage"
                type="number"
                value={form.estimatedDamage}
                onChange={(e) => set('estimatedDamage', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="เช่น 500000"
                min={0}
                step="0.01"
              />
            </div>
          </div>
          <div>
            <label htmlFor="intake-description" className="block text-sm font-medium">รายละเอียด</label>
            <textarea id="intake-description"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="เกิดอะไรขึ้น เมื่อไหร่ ใครเกี่ยวข้อง และต้องการให้สำนักงานช่วยเรื่องใด"
            />
          </div>
        </div>

        {/* ผู้ส่งเรื่อง */}
        <details className="space-y-3 rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">ช่องทางและผู้ส่งเรื่อง <span className="text-sm font-normal text-muted-foreground">· {REFERRAL_CHANNEL_LABELS[form.referralChannel]} · {form.referralName || REFERRAL_TYPE_LABELS[form.referralType]}</span></summary>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="intake-referralType" className="block text-sm font-medium">ประเภทผู้ส่ง</label>
              <select id="intake-referralType"
                value={form.referralType}
                onChange={(e) => set('referralType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(REFERRAL_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="intake-referralChannel" className="block text-sm font-medium">ช่องทาง</label>
              <select id="intake-referralChannel"
                value={form.referralChannel}
                onChange={(e) => set('referralChannel', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(REFERRAL_CHANNEL_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="intake-referralName" className="block text-sm font-medium">ชื่อผู้ส่งเรื่อง</label>
            <input id="intake-referralName"
              value={form.referralName}
              onChange={(e) => set('referralName', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="ชื่อ-นามสกุล หรือชื่อองค์กร"
            />
          </div>
        </details>

        {/* คดีเดินอยู่แล้วที่อื่น */}
        <details className="space-y-3 rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">มีคดีที่ดำเนินอยู่กับทนายหรือสำนักงานอื่น</summary>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isOngoingElsewhere}
              onChange={(e) => setForm((f) => ({ ...f, isOngoingElsewhere: e.target.checked }))}
            />
            คดีนี้กำลังดำเนินอยู่แล้วที่อื่น (ฟ้องไปแล้ว/ทนายอื่นดูแลอยู่) ก่อนเข้าสำนักงานเรา
          </label>
          {form.isOngoingElsewhere && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="intake-externalCaseNumber" className="block text-sm font-medium">เลขคดี/หมายเลขดำ (ถ้าทราบ)</label>
                <input id="intake-externalCaseNumber"
                  value={form.externalCaseNumber}
                  onChange={(e) => set('externalCaseNumber', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="เช่น ดำที่ 123/2569"
                />
              </div>
              <div>
                <label htmlFor="intake-currentStageNote" className="block text-sm font-medium">สถานะปัจจุบัน</label>
                <input id="intake-currentStageNote"
                  value={form.currentStageNote}
                  onChange={(e) => set('currentStageNote', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="เช่น นัดสืบพยาน 15 ต.ค."
                />
              </div>
            </div>
          )}
        </details>

        {/* งานก่อนฟ้อง */}
        <div className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">งานก่อนฟ้อง</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="intake-preLitigationType" className="block text-sm font-medium">ลักษณะ flow</label>
              <select
                id="intake-preLitigationType"
                value={form.preLitigationType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setForm((previous) => ({
                    ...previous,
                    preLitigationType: nextType,
                    matterType: nextType === 'MEDICAL_CLAIM' ? 'MEDICAL' : previous.matterType,
                    preLitigationStatus: DEFAULT_PRE_LITIGATION_STATUS[nextType] ?? previous.preLitigationStatus,
                  }));
                }}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(PRE_LITIGATION_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="intake-preLitigationStatus" className="block text-sm font-medium">สถานะเริ่มต้น</label>
              <select
                id="intake-preLitigationStatus"
                value={form.preLitigationStatus}
                onChange={(e) => set('preLitigationStatus', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="NOTICE_TO_SEND">เตรียมส่ง Notice</option>
                <option value="NOTICE_SENT">ส่ง Notice แล้ว</option>
                <option value="UNDER_REVIEW">รอพิจารณา/ตรวจเอกสาร</option>
                <option value="NEGOTIATING">เจรจาก่อนฟ้อง</option>
                <option value="NOT_STARTED">ยังไม่เริ่ม</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="intake-preLitigationNotes" className="block text-sm font-medium">บันทึกก่อนฟ้อง</label>
            <textarea
              id="intake-preLitigationNotes"
              value={form.preLitigationNotes}
              onChange={(e) => set('preLitigationNotes', e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="เช่น แพทย์: notice > review > สรุปรายงาน > offer/อุทธรณ์ความเห็น หรือ ขนส่ง: notice > เจรจา > ฟ้อง/ไม่ฟ้อง"
            />
          </div>
        </div>

        {/* วันที่รับเรื่อง */}
        <div>
          <label htmlFor="intake-receivedDate" className="block text-sm font-medium">วันที่รับเรื่อง *</label>
          <input id="intake-receivedDate"
            type="date"
            required
            value={form.receivedDate}
            onChange={(e) => set('receivedDate', e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Button type="button" variant="outline" disabled={submitting || !!createdIntakeId} onClick={() => router.push('/intake')}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={submitting || analysisBusy}>
            {submitting
              ? 'กำลังบันทึก...'
              : createdIntakeId
                ? 'แนบไฟล์ที่เหลืออีกครั้ง'
                : 'บันทึกและไปเพิ่มเอกสาร'}
          </Button>
        </div>
        </fieldset>
      </form>
    </div>
  );
}
