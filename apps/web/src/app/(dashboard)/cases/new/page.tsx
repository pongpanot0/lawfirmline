'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, UserItem, CaseTypeItem, ClientItem, CourtItem, ApiError, WorkloadSummary } from '@/lib/api';
import { Stepper } from '@/components/ui/Stepper';
import { Button } from '@/components/ui/button';
import type { CaseFieldSchema } from '@lawfirm/shared';
import {
  ActivityType,
  TMP_CLIENT_PLACEHOLDER,
  CourtLevel,
  COURT_LEVEL_LABELS,
  CASE_NUMBER_HINT,
  CASE_NUMBER_HTML,
  CASE_NUMBER_REGEX,
  FEE_MAX,
  FEE_MIN,
} from '@lawfirm/shared';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

const STEPS = [
  { id: 'type', label: 'Case Type', description: 'ประเภทคดี' },
  { id: 'basic', label: 'Basic Info', description: 'ข้อมูลพื้นฐาน' },
  { id: 'custom', label: 'Details', description: 'รายละเอียดเพิ่มเติม' },
  { id: 'team', label: 'Team', description: 'ทีมงาน' },
];

export default function NewCasePage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const nf = d.cases.newForm;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);

  const [form, setForm] = useState({
    caseTypeId: '',
    customerRef: '',
    title: '',
    clientId: '',
    clientName: '',
    useTmpClient: false,
    courtName: '',
    courtLevel: CourtLevel.TRIAL as CourtLevel,
    blackCaseNumber: '',
    redCaseNumber: '',
    description: '',
    estimatedFee: '',
    leadLawyerId: user?.id ?? '',
    buddyIds: [] as string[],
    customFields: {} as Record<string, string>,
    addInitialActivity: false,
    initialActivityTitle: '',
    initialActivityAt: '',
    initialActivityType: ActivityType.COURT_DATE as string,
    initialActivityDescription: '',
  });
  const [nextOwnRef, setNextOwnRef] = useState<string>('');

  const selectedType = caseTypes.find((t) => t.id === form.caseTypeId);
  const fieldSchema = (Array.isArray(selectedType?.fieldSchema)
    ? selectedType.fieldSchema
    : []) as CaseFieldSchema[];

  const workloadLabel = (userId: string) => {
    const w = workload.find((x) => x.userId === userId);
    if (!w) return '';
    return ` (Lead ${w.leadCount}, Buddy ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})`;
  };

  useEffect(() => {
    if (!token) return;
    setLoadingTypes(true);
    Promise.all([
      api.getLawyers(token),
      api.getCaseTypes(token),
      api.getClients(token).catch(() => [] as ClientItem[]),
      api.getCourts(token).catch(() => [] as CourtItem[]),
      api.getNextOwnRef(token).catch(() => ({ ownRef: '' })),
      api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
    ])
      .then(([lawyerList, types, clientList, courtList, nextRef, workloadList]) => {
        setLawyers(lawyerList);
        setCaseTypes(types);
        setClients(clientList);
        setCourts(courtList);
        setNextOwnRef(nextRef.ownRef);
        setWorkload(workloadList);
      })
      .catch(() => setError('Failed to load case form data / โหลดข้อมูลฟอร์มไม่สำเร็จ กรุณาลองใหม่'))
      .finally(() => setLoadingTypes(false));
  }, [token]);

  useEffect(() => {
    if (user?.id && !form.leadLawyerId) {
      setForm((f) => ({ ...f, leadLawyerId: user.id }));
    }
  }, [user, form.leadLawyerId]);

  const toggleBuddy = (id: string) => {
    setForm((prev) => ({
      ...prev,
      buddyIds: prev.buddyIds.includes(id)
        ? prev.buddyIds.filter((x) => x !== id)
        : [...prev.buddyIds, id],
    }));
  };

  const displayClientName = () => {
    if (form.clientId) {
      return clients.find((c) => c.id === form.clientId)?.name ?? '';
    }
    if (form.useTmpClient) return TMP_CLIENT_PLACEHOLDER;
    return form.clientName.trim() || TMP_CLIENT_PLACEHOLDER;
  };

  const canNext = () => {
    if (step === 0) return !!form.caseTypeId;
    if (step === 1) {
      const hasCourt = !!form.courtName && !!form.courtLevel;
      const hasCaseNumbers =
        CASE_NUMBER_REGEX.test(form.blackCaseNumber.trim()) &&
        CASE_NUMBER_REGEX.test(form.redCaseNumber.trim());
      const activityOk = !form.addInitialActivity || (form.initialActivityTitle && form.initialActivityAt);
      return form.title && hasCourt && hasCaseNumbers && activityOk;
    }
    if (step === 2) {
      return fieldSchema
        .filter((f) => f.required)
        .every((f) => form.customFields[f.key]?.trim());
    }
    if (step === 3) return !!form.leadLawyerId;
    return true;
  };

  const goNext = () => {
    if (step === 1 && fieldSchema.length === 0) {
      setStep(3);
      return;
    }
    setStep(step + 1);
  };

  const goBack = () => {
    if (step === 3 && fieldSchema.length === 0) {
      setStep(1);
      return;
    }
    if (step > 0) setStep(step - 1);
    else router.back();
  };

  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        customerRef: form.customerRef.trim() || undefined,
        title: form.title,
        description: form.description || undefined,
        courtName: form.courtName,
        courtLevel: form.courtLevel,
        blackCaseNumber: form.blackCaseNumber.trim(),
        redCaseNumber: form.redCaseNumber.trim(),
        estimatedFee: form.estimatedFee ? parseFloat(form.estimatedFee) : undefined,
        leadLawyerId: form.leadLawyerId,
        caseTypeId: form.caseTypeId,
        buddyIds: form.buddyIds,
        customFields: Object.keys(form.customFields).length ? form.customFields : undefined,
      };
      if (form.clientId) {
        payload.clientId = form.clientId;
        const client = clients.find((c) => c.id === form.clientId);
        if (client) payload.clientName = client.name;
      } else {
        payload.clientName = form.useTmpClient
          ? TMP_CLIENT_PLACEHOLDER
          : form.clientName.trim() || TMP_CLIENT_PLACEHOLDER;
      }
      if (form.addInitialActivity && form.initialActivityTitle && form.initialActivityAt) {
        payload.initialActivity = {
          title: form.initialActivityTitle,
          description: form.initialActivityDescription || undefined,
          activityAt: new Date(form.initialActivityAt).toISOString(),
          type: form.initialActivityType,
        };
      }
      const created = (await api.createCase(token, payload)) as { id: string };
      router.push(`/cases/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to create case / สร้างคดีไม่สำเร็จ กรุณาลองใหม่',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Create New Case / สร้างคดีใหม่</h1>
      <p className="mb-6 text-sm text-slate-500">
        Multi-step case intake / ขั้นตอนสร้างคดี พร้อมเลขที่แฟ้มอัตโนมัติ
      </p>

      <Stepper steps={STEPS} currentStep={step} onStepClick={(i) => i < step && setStep(i)} />

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 0 && (
          <div className="space-y-3">
            <h2 className="font-semibold">Select Case Type / เลือกประเภทคดี</h2>
            {loadingTypes ? (
              <p className="text-sm text-slate-500">Loading case types... / กำลังโหลดประเภทคดี...</p>
            ) : caseTypes.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">No case types available / ยังไม่มีประเภทคดี</p>
                <p className="mt-1 text-amber-800">
                  กรุณาเพิ่มประเภทคดีอย่างน้อย 1 รายการก่อนสร้างคดี
                </p>
                <Link
                  href="/admin/case-types"
                  className="mt-3 inline-block font-medium text-brand-700 hover:underline"
                >
                  Go to Case Types settings / ไปที่ตั้งค่าประเภทคดี →
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {caseTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm({ ...form, caseTypeId: t.id, customFields: {} })}
                    className={`rounded-lg border p-4 text-left transition-colors ${
                      form.caseTypeId === t.id
                        ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
                        : 'border-slate-200 hover:border-brand-300'
                    }`}
                  >
                    <p className="font-medium">{t.name}</p>
                    {t.description && (
                      <p className="mt-1 text-xs text-slate-500">{t.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Basic Information / ข้อมูลพื้นฐาน</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700">Own Ref</label>
              <div className="mt-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm">
                <span className="font-mono font-medium text-slate-900">
                  {nextOwnRef || 'TSBREFYYYY0001'}
                </span>
                <p className="mt-1 text-xs text-slate-500">
                  สร้างอัตโนมัติ · รูปแบบ TSBREF + ปี + เลขรันต่อเนื่อง (รีเซ็ตทุกปี)
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Customer Ref
                <span className="ml-1 font-normal text-slate-500">(ไม่บังคับ)</span>
              </label>
              <input
                value={form.customerRef}
                onChange={(e) => setForm({ ...form, customerRef: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="เลขอ้างอิงจากลูกค้า / บริษัท"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">เลขดำ *</label>
                <input
                  required
                  inputMode="numeric"
                  pattern={CASE_NUMBER_HTML}
                  title={CASE_NUMBER_HINT}
                  value={form.blackCaseNumber}
                  onChange={(e) => setForm({ ...form, blackCaseNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="เช่น 123/2567"
                />
                <p className="mt-1 text-xs text-slate-500">{CASE_NUMBER_HINT}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">เลขแดง *</label>
                <input
                  required
                  inputMode="numeric"
                  pattern={CASE_NUMBER_HTML}
                  title={CASE_NUMBER_HINT}
                  value={form.redCaseNumber}
                  onChange={(e) => setForm({ ...form, redCaseNumber: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="เช่น 456/2567"
                />
                <p className="mt-1 text-xs text-slate-500">{CASE_NUMBER_HINT}</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">ชื่อคดี *</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {nf.clientLabel}{' '}
                <span className="font-normal text-slate-500">({nf.clientOptional})</span>
              </label>
              <select
                value={form.clientId}
                disabled={form.useTmpClient}
                onChange={(e) => {
                  const client = clients.find((c) => c.id === e.target.value);
                  setForm({
                    ...form,
                    clientId: e.target.value,
                    clientName: client?.name ?? '',
                    useTmpClient: false,
                  });
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              >
                <option value="">{nf.selectClient}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {nf.noClientsYet}{' '}
                  <Link href="/clients/new" className="text-brand-700 hover:underline">
                    {nf.createClient}
                  </Link>
                </p>
              )}
              {!form.clientId && (
                <div className="mt-2 space-y-2">
                  <input
                    value={form.useTmpClient ? TMP_CLIENT_PLACEHOLDER : form.clientName}
                    disabled={form.useTmpClient}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        clientName: e.target.value,
                        useTmpClient: false,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    placeholder={nf.clientNamePlaceholder}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant={form.useTmpClient ? 'default' : 'outline'}
                      size="sm"
                      onClick={() =>
                        setForm({
                          ...form,
                          clientId: '',
                          clientName: TMP_CLIENT_PLACEHOLDER,
                          useTmpClient: true,
                        })
                      }
                    >
                      {nf.useTmpClient}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">{nf.tmpClientHint}</p>
                  {form.useTmpClient && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {fmt(nf.tmpClientActive, { name: TMP_CLIENT_PLACEHOLDER })}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                รายได้โดยประมาณ (บาท)
                <span className="ml-1 font-normal text-slate-500">(ไม่บังคับ)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min={FEE_MIN}
                max={FEE_MAX}
                value={form.estimatedFee}
                onChange={(e) => setForm({ ...form, estimatedFee: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="เช่น 50000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">ระดับศาล *</label>
              <select
                required
                value={form.courtLevel}
                onChange={(e) => setForm({ ...form, courtLevel: e.target.value as CourtLevel })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(COURT_LEVEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Court / ศาล *</label>
              <select
                required
                value={form.courtName}
                onChange={(e) => setForm({ ...form, courtName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select court / เลือกศาล</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              {courts.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">Loading courts... / กำลังโหลดข้อมูลศาล...</p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.addInitialActivity}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    const now = new Date();
                    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                    setForm({
                      ...form,
                      addInitialActivity: checked,
                      initialActivityAt: checked && !form.initialActivityAt
                        ? now.toISOString().slice(0, 16)
                        : form.initialActivityAt,
                    });
                  }}
                />
                Add initial appointment / เพิ่มนัดหมายแรก
              </label>
              {form.addInitialActivity && (
                <>
                  <input
                    required
                    value={form.initialActivityTitle}
                    onChange={(e) => setForm({ ...form, initialActivityTitle: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="เช่น นัดสืบพยาน, นัดไกล่เกลี่ย, ยื่นฟ้อง"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select
                      value={form.initialActivityType}
                      onChange={(e) => setForm({ ...form, initialActivityType: e.target.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value={ActivityType.COURT_DATE}>Court Date / นัดศาล</option>
                      <option value={ActivityType.CLIENT_MEETING}>Client Meeting / นัดลูกค้า</option>
                      <option value={ActivityType.FILING}>Filing / ยื่นคำร้อง</option>
                      <option value={ActivityType.DEADLINE}>Deadline / กำหนดส่ง</option>
                      <option value={ActivityType.OTHER}>Other / อื่นๆ</option>
                    </select>
                    <input
                      required
                      type="datetime-local"
                      value={form.initialActivityAt}
                      onChange={(e) => setForm({ ...form, initialActivityAt: e.target.value })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    value={form.initialActivityDescription}
                    onChange={(e) => setForm({ ...form, initialActivityDescription: e.target.value })}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none"
                    placeholder="รายละเอียดเพิ่มเติม (ไม่บังคับ)"
                  />
                </>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">รายละเอียด</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold">
              {selectedType?.name} — Specific Fields / ข้อมูลเฉพาะประเภทคดี
            </h2>
            {fieldSchema.length === 0 ? (
              <p className="text-sm text-slate-500">ไม่มีข้อมูลเพิ่มเติมสำหรับประเภทคดีนี้</p>
            ) : (
              fieldSchema.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-slate-700">
                    {field.label}{field.required ? ' *' : ''}
                  </label>
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    required={field.required}
                    value={form.customFields[field.key] ?? ''}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        customFields: { ...form.customFields, [field.key]: e.target.value },
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              ))
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="font-semibold">Assign Team / มอบหมายทีม</h2>
            <p className="text-sm text-slate-500">
              เลือกเจ้าของเคส 1 คน และ Buddy (ผู้ช่วย) ได้หลายคน — ทุกคนเป็นทนาย
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Case Owner / เจ้าของเคส *
              </label>
              <select
                required
                value={form.leadLawyerId}
                onChange={(e) =>
                  setForm({
                    ...form,
                    leadLawyerId: e.target.value,
                    buddyIds: form.buddyIds.filter((id) => id !== e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select case owner / เลือกเจ้าของเคส</option>
                {lawyers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.firstName} {l.lastName}
                    {workloadLabel(l.id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Buddies / ผู้ช่วย
              </label>
              <div className="mt-2 space-y-2">
                {lawyers
                  .filter((l) => l.id !== form.leadLawyerId)
                  .map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.buddyIds.includes(l.id)}
                        onChange={() => toggleBuddy(l.id)}
                      />
                      {l.firstName} {l.lastName}
                      {workloadLabel(l.id)}
                    </label>
                  ))}
                {lawyers.filter((l) => l.id !== form.leadLawyerId).length === 0 && (
                  <p className="text-xs text-slate-400">ไม่มีทนายคนอื่นในสำนักงานให้เลือกเป็น Buddy</p>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium">Summary / สรุป</p>
              <p className="mt-1">{form.title} — {displayClientName()}</p>
              <p className="text-xs text-slate-400">
                Own Ref {nextOwnRef || 'auto'}
                {form.customerRef ? ` · Customer Ref ${form.customerRef}` : ''}
              </p>
              <p className="text-xs text-slate-400">
                เลขดำ {form.blackCaseNumber || '—'} · เลขแดง {form.redCaseNumber || '—'}
              </p>
              <p className="text-xs text-slate-400">
                {COURT_LEVEL_LABELS[form.courtLevel]} · {form.courtName}
              </p>
              {form.addInitialActivity && form.initialActivityTitle && (
                <p className="text-xs text-slate-400">
                  First activity / กิจกรรมแรก: {form.initialActivityTitle}
                </p>
              )}
              <p className="mt-1 text-xs text-brand-600">
                Folder ID will be auto-generated / ระบบจะสร้างเลขที่แฟ้มให้อัตโนมัติเมื่อสร้างคดี
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        {!canNext() && step === 0 && !loadingTypes && caseTypes.length > 0 && (
          <p className="mt-4 text-sm text-muted-foreground">เลือกประเภทคดีด้านบนเพื่อดำเนินการต่อ</p>
        )}

        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 py-4 pb-6 sm:-mx-6">
          <Button type="button" variant="outline" onClick={goBack}>
            {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={!canNext()} onClick={goNext}>
              ถัดไป
            </Button>
          ) : (
            <Button type="button" disabled={submitting || !canNext()} onClick={handleSubmit}>
              {submitting ? 'กำลังสร้าง...' : 'สร้างคดี'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
