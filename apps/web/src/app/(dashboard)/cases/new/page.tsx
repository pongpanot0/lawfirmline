'use client';

import { CaseCostCalculator } from '@/components/cases/CaseCostCalculator';
import {
  CASE_COSTS_KEY,
  initialCaseCosts,
  caseCostTotal,
} from '@/lib/case-costs';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { ClientCombobox } from './ClientCombobox';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  api,
  UserItem,
  CaseTypeItem,
  ClientItem,
  CourtItem,
  ApiError,
  WorkloadSummary,
  FieldSuggestion,
} from '@/lib/api';
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

export default function NewCasePage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [costLines, setCostLines] = useState(initialCaseCosts);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittingRef = useRef(false);
  const [autoTitle, setAutoTitle] = useState(true);
  const [showCostEstimate, setShowCostEstimate] = useState(false);
  const [courtSearch, setCourtSearch] = useState('');
  const [retry, setRetry] = useState(0);
  const [lookupWarning, setLookupWarning] = useState('');
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
    claimedAmount: '',
    estimatedFee: '',
    leadLawyerId: '',
    buddyIds: [] as string[],
    customFields: {} as Record<string, string>,
    addInitialActivity: false,
    initialActivityTitle: '',
    initialActivityAt: '',
    initialActivityType: ActivityType.COURT_DATE as string,
    initialActivityDescription: '',
  });
  const [nextOwnRef, setNextOwnRef] = useState<string>('');
  /**
   * Values the documents state. Re-analysing replaces these, never the form —
   * what a lawyer typed or accepted stays put.
   */
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);

  const selectedType = caseTypes.find((t) => t.id === form.caseTypeId);
  const fieldSchema = (
    Array.isArray(selectedType?.fieldSchema) ? selectedType.fieldSchema : []
  ) as CaseFieldSchema[];

  const workloadLabel = (userId: string) => {
    const w = workload.find((x) => x.userId === userId);
    if (!w) return '';
    return ` (หลัก ${w.leadCount}, ผู้ช่วย ${w.buddyCount}, ใกล้ deadline ${w.nearDeadlineCount})`;
  };

  useEffect(() => {
    if (!token) return;
    setLoadingTypes(true);
    setError('');
    setLookupWarning('');
    Promise.all([
      api.getLawyers(token),
      api.getCaseTypes(token),
      api.getClients(token).catch(() => {
        setLookupWarning(
          'โหลดข้อมูลลูกค้าหรือศาลไม่สำเร็จ ลองโหลดใหม่ก่อนกรอกต่อ',
        );
        return [] as ClientItem[];
      }),
      api.getCourts(token).catch(() => {
        setLookupWarning(
          'โหลดข้อมูลลูกค้าหรือศาลไม่สำเร็จ ลองโหลดใหม่ก่อนกรอกต่อ',
        );
        return [] as CourtItem[];
      }),
      api.getNextOwnRef(token).catch(() => ({ ownRef: '' })),
      api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
    ])
      .then(
        ([lawyerList, types, clientList, courtList, nextRef, workloadList]) => {
          setLawyers(lawyerList);
          setForm((f) => ({
            ...f,
            leadLawyerId: lawyerList.some((l) => l.id === f.leadLawyerId)
              ? f.leadLawyerId
              : (lawyerList.find((l) => l.id === user?.id)?.id ?? ''),
            caseTypeId: f.caseTypeId || (types.length === 1 ? types[0].id : ''),
          }));
          setCaseTypes(types);
          setClients(clientList);
          setCourts(courtList);
          setNextOwnRef(nextRef.ownRef);
          setWorkload(workloadList);
        },
      )
      .catch(() => setError('โหลดข้อมูลฟอร์มไม่สำเร็จ กรุณาลองใหม่'))
      .finally(() => setLoadingTypes(false));
  }, [token, user?.id, retry]);

  const clientLabel = form.clientId
    ? (clients.find((c) => c.id === form.clientId)?.name ?? '')
    : form.useTmpClient
      ? ''
      : form.clientName.trim();
  const suggestedTitle = [selectedType?.name, clientLabel]
    .filter(Boolean)
    .join(' — ');
  useEffect(() => {
    if (autoTitle) setForm((f) => ({ ...f, title: suggestedTitle }));
  }, [autoTitle, suggestedTitle]);
  useEffect(() => {
    if (step > 0) headingRef.current?.focus();
  }, [step]);

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

  const validationMessage = (targetStep: number) => {
    if (targetStep === 0 && !form.caseTypeId)
      return 'เลือกประเภทคดีก่อนดำเนินการต่อ';
    if (targetStep === 1) {
      if (
        form.claimedAmount &&
        (!Number.isFinite(Number(form.claimedAmount)) ||
          Number(form.claimedAmount) < 0 ||
          Number(form.claimedAmount) > FEE_MAX ||
          !/^\d+(\.\d{1,2})?$/.test(form.claimedAmount))
      )
        return 'กรุณากรอกทุนทรัพย์เป็นจำนวนเงินตั้งแต่ 0 และทศนิยมไม่เกิน 2 ตำแหน่ง';
      if (!form.title.trim()) return 'กรุณากรอกชื่อคดี';
      // The court itself may not be known yet (e.g. a consult that hasn't
      // gone to court) — only the level defaults, court name stays optional.
      // Court numbers arrive after the case is opened; only a filled-in
      // value has to fit the format.
      if (
        form.blackCaseNumber.trim() &&
        !CASE_NUMBER_REGEX.test(form.blackCaseNumber.trim())
      )
        return `เลขดำ: ${CASE_NUMBER_HINT}`;
      if (
        form.redCaseNumber.trim() &&
        !CASE_NUMBER_REGEX.test(form.redCaseNumber.trim())
      )
        return `เลขแดง: ${CASE_NUMBER_HINT}`;
      if (
        form.estimatedFee &&
        (!Number.isFinite(Number(form.estimatedFee)) ||
          Number(form.estimatedFee) < FEE_MIN ||
          Number(form.estimatedFee) > FEE_MAX ||
          !/^\d+(\.\d{1,2})?$/.test(form.estimatedFee))
      )
        return 'กรุณากรอกรายได้ในช่วงที่กำหนด และทศนิยมไม่เกิน 2 ตำแหน่ง';
      if (
        form.addInitialActivity &&
        (!form.initialActivityTitle.trim() ||
          !form.initialActivityAt ||
          Number.isNaN(new Date(form.initialActivityAt).getTime()))
      )
        return 'กรุณากรอกหัวข้อและวันเวลานัดหมายแรก';
      const missing = fieldSchema.find(
        (f) => f.required && !form.customFields[f.key]?.trim(),
      );
      if (missing) return `กรุณากรอก${missing.label}`;
    }
    if (targetStep === 2 && !lawyers.some((l) => l.id === form.leadLawyerId))
      return 'กรุณาเลือกทนายผู้รับผิดชอบ';
    return '';
  };
  // Type-specific fields live inside "ข้อมูลคดี": a step of their own made
  // lawyers click through a page holding one or two optional inputs.
  const visibleSteps = [
    { value: 0, label: 'ประเภทคดี' },
    { value: 1, label: 'ข้อมูลคดี' },
    { value: 2, label: 'ทีมและตรวจสอบ' },
  ];

  const goNext = () => {
    const message = validationMessage(step);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const goBack = () => {
    setError('');
    if (step > 0) setStep(step - 1);
    else router.push('/cases');
  };

  const handleSubmit = async () => {
    if (!token || submittingRef.current || analysisBusy) return;
    for (const target of visibleSteps) {
      const message = validationMessage(target.value);
      if (message) {
        setStep(target.value);
        setError(message);
        return;
      }
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        customerRef: form.customerRef.trim() || undefined,
        title: form.title.trim(),
        description: form.description || undefined,
        courtName: form.courtName,
        courtLevel: form.courtLevel,
        blackCaseNumber: form.blackCaseNumber.trim() || undefined,
        redCaseNumber: form.redCaseNumber.trim() || undefined,
        claimedAmount: form.claimedAmount
          ? Number(form.claimedAmount)
          : undefined,
        estimatedFee: form.estimatedFee
          ? parseFloat(form.estimatedFee)
          : undefined,
        leadLawyerId: form.leadLawyerId,
        caseTypeId: form.caseTypeId,
        buddyIds: form.buddyIds.filter((id) => id !== form.leadLawyerId),
        customFields: {
          ...form.customFields,
          [CASE_COSTS_KEY]: JSON.stringify(costLines),
        },
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
      if (
        form.addInitialActivity &&
        form.initialActivityTitle &&
        form.initialActivityAt
      ) {
        payload.initialActivity = {
          title: form.initialActivityTitle,
          description: form.initialActivityDescription || undefined,
          activityAt: new Date(form.initialActivityAt).toISOString(),
          type: form.initialActivityType,
        };
      }
      const created = createdCaseId
        ? { id: createdCaseId }
        : ((await api.createCase(token, payload)) as { id: string });
      setCreatedCaseId(created.id);
      const failedFiles: File[] = [];
      for (const file of files) {
        try {
          await api.uploadDocument(token, created.id, file);
        } catch {
          failedFiles.push(file);
        }
      }
      setFiles(failedFiles);
      if (failedFiles.length) {
        setError(
          `สร้างคดีแล้ว แต่แนบไฟล์ไม่สำเร็จ ${failedFiles.length} ไฟล์ กดอีกครั้งเพื่อแนบไฟล์ที่เหลือ โดยไม่สร้างคดีซ้ำ`,
        );
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      router.push(`/cases/${created.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'สร้างคดีไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่',
      );
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const inputClass =
    'mt-1 min-w-0 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
  const fieldLabel = 'block text-sm font-medium';
  const selectedLawyer = lawyers.find((l) => l.id === form.leadLawyerId);
  const currentIndex = visibleSteps.findIndex((item) => item.value === step);

  // Hallmark · pre-emit critique: P4 H4 E4 S5 R5 V4 · existing Samnuan design tokens
  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 pb-20 [overflow-wrap:anywhere]">
      <Link href="/cases" className="text-sm text-primary hover:underline">
        ← กลับไปหน้าคดี
      </Link>
      <h1 className="mt-3 text-2xl font-bold">สร้างคดีใหม่</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        เริ่มจากประเภทคดี แล้วกรอกข้อมูลที่มี
        ระบบช่วยเตรียมชื่อคดีและเลขอ้างอิงให้
      </p>
      <nav aria-label="ขั้นตอนสร้างคดี" className="my-6">
        <ol className="grid grid-cols-2 gap-2 sm:flex">
          {visibleSteps.map((item, index) => (
            <li key={item.value} className="min-w-0 sm:flex-1">
              <button
                type="button"
                disabled={item.value > step || submitting}
                aria-current={item.value === step ? 'step' : undefined}
                onClick={() => {
                  setStep(item.value);
                  setError('');
                }}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-3 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${item.value === step ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground disabled:opacity-60'}`}
              >
                <span className="shrink-0">
                  {item.value < step ? '✓' : index + 1}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (step === 2) void handleSubmit();
          else goNext();
        }}
        className="rounded-xl border border-border bg-card text-card-foreground shadow-soft"
      >
        <fieldset
          disabled={submitting || analysisBusy || !!createdCaseId}
          className="min-w-0 space-y-6 p-4 sm:p-6"
        >
          <div>
            <p className="text-xs text-muted-foreground">
              ขั้นตอน {currentIndex + 1} จาก {visibleSteps.length}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-lg font-semibold focus:outline-none"
            >
              {visibleSteps[currentIndex]?.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 0
                ? 'เลือกประเภทที่ตรงกับคดี เพื่อแสดงเฉพาะข้อมูลที่เกี่ยวข้อง'
                : step === 1
                  ? 'ช่องที่มี * จำเป็นต้องกรอก ข้อมูลอื่นเพิ่มภายหลังได้'
                  : 'ตรวจสอบข้อมูลก่อนสร้างคดี และเลือกทีมที่ดูแล'}
            </p>
          </div>

          {(error || lookupWarning) && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p>{error || lookupWarning}</p>
              {((step === 0 && caseTypes.length === 0) || lookupWarning) && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  โหลดข้อมูลใหม่
                </Button>
              )}
            </div>
          )}

          {step === 0 && (
            <div className="space-y-4">
              {loadingTypes ? (
                <p role="status" className="text-sm text-muted-foreground">
                  กำลังเตรียมข้อมูล…
                </p>
              ) : caseTypes.length === 0 ? (
                <p className="text-sm">
                  ยังไม่มีประเภทคดี{' '}
                  <Link
                    href="/admin/case-types"
                    className="text-primary underline"
                  >
                    เพิ่มประเภทคดี
                  </Link>
                  ก่อนเริ่ม
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {caseTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      aria-pressed={form.caseTypeId === type.id}
                      onClick={() =>
                        setForm((f) =>
                          f.caseTypeId === type.id
                            ? f
                            : { ...f, caseTypeId: type.id, customFields: {} },
                        )
                      }
                      className={`rounded-lg border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${form.caseTypeId === type.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}
                    >
                      <span className="flex items-center justify-between gap-2 font-medium">
                        {type.name}
                        <span aria-hidden="true">
                          {form.caseTypeId === type.id ? '✓' : '○'}
                        </span>
                      </span>
                      {type.description && (
                        <span className="mt-2 block text-sm text-muted-foreground">
                          {type.description}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <section className="space-y-4" aria-label="ลูกค้าและชื่อคดี">
                <div>
                  <label htmlFor="client-combobox" className={fieldLabel}>
                    ลูกค้า{' '}
                    <span className="font-normal text-muted-foreground">
                      (เพิ่มภายหลังได้)
                    </span>
                  </label>
                  <ClientCombobox
                    id="client-combobox"
                    clients={clients}
                    clientId={form.clientId}
                    clientName={form.clientName}
                    disabled={form.useTmpClient}
                    onSelectClient={(client) =>
                      setForm({
                        ...form,
                        clientId: client.id,
                        clientName: client.name,
                        useTmpClient: false,
                      })
                    }
                    onFreeText={(name) =>
                      setForm({ ...form, clientId: '', clientName: name })
                    }
                  />
                  {!form.clientId && form.clientName.trim() && !form.useTmpClient && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      บันทึกชื่อในคดีนี้ โดยยังไม่สร้างทะเบียนลูกค้า
                    </p>
                  )}
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={form.useTmpClient}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          useTmpClient: e.target.checked,
                          clientId: e.target.checked ? '' : form.clientId,
                        })
                      }
                    />
                    ยังไม่ทราบชื่อลูกค้า ระบุภายหลัง
                  </label>
                  {form.useTmpClient && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      จะใช้ชื่อ “{TMP_CLIENT_PLACEHOLDER}” ชั่วคราว
                      ยกเลิกเครื่องหมายเพื่อกลับไปกรอกชื่อ
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="case-title" className={fieldLabel}>
                    ชื่อคดี *
                  </label>
                  <input
                    id="case-title"
                    required
                    value={form.title}
                    onChange={(e) => {
                      setAutoTitle(false);
                      setForm({ ...form, title: e.target.value });
                    }}
                    className={inputClass}
                    placeholder="เช่น เรียกชำระหนี้ — บริษัท ตัวอย่าง"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      {autoTitle
                        ? 'เติมจากประเภทคดีและลูกค้าให้อัตโนมัติ แก้ไขได้ตามต้องการ'
                        : 'ใช้ชื่อที่คุณแก้ไขไว้'}
                    </p>
                    {!autoTitle && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setAutoTitle(true)}
                      >
                        ใช้ชื่อแนะนำ
                      </Button>
                    )}
                  </div>
                </div>
              </section>

              <div>
                <label htmlFor="claimed-amount" className={fieldLabel}>
                  ทุนทรัพย์ (บาท)
                </label>
                <input
                  id="claimed-amount"
                  type="number"
                  min="0"
                  max={FEE_MAX}
                  step="0.01"
                  value={form.claimedAmount}
                  onChange={(e) =>
                    setForm({ ...form, claimedAmount: e.target.value })
                  }
                  className={inputClass}
                  placeholder="ระบุจำนวนเงินที่เรียกร้อง"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  แยกจากค่าทนายและค่าใช้จ่ายดำเนินคดี
                </p>
              </div>
              <section className="rounded-lg border border-border p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-expanded={showCostEstimate}
                  onClick={() => setShowCostEstimate((value) => !value)}
                >
                  <span>คำนวณค่าบริการและค่าไปศาล (ไม่บังคับ)</span>
                  <span className="text-xs text-muted-foreground">
                    {showCostEstimate ? 'ซ่อน' : 'เปิด'}
                  </span>
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  ข้ามได้ตอนเปิดคดี แล้วกลับมาเติมในหน้ารายละเอียดคดี
                </p>
                {showCostEstimate && (
                  <div className="mt-4">
                    <CaseCostCalculator
                      value={costLines}
                      onChange={setCostLines}
                      disabled={submitting || analysisBusy || !!createdCaseId}
                    />
                  </div>
                )}
              </section>
              <section
                className="space-y-4 border-t border-border pt-5"
                aria-labelledby="court-heading"
              >
                <h3 id="court-heading" className="font-semibold">
                  ข้อมูลศาลและหมายเลขคดี
                </h3>
                <p className="text-xs text-muted-foreground">
                  ยังไม่มีเลขดำ/เลขแดงก็เปิดคดีได้
                  ระบบใช้เลขอ้างอิงสำนักงานติดตามไปก่อน
                  แล้วมาเติมเลขจากศาลในหน้าคดีเมื่อได้รับ
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="court-level" className={fieldLabel}>
                      ระดับศาล *
                    </label>
                    <select
                      id="court-level"
                      value={form.courtLevel}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          courtLevel: e.target.value as CourtLevel,
                        })
                      }
                      className={inputClass}
                    >
                      {Object.entries(COURT_LEVEL_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      เริ่มต้นที่ศาลชั้นต้น เปลี่ยนได้ตามคดี
                    </p>
                  </div>
                  <div>
                    <label htmlFor="court-search" className={fieldLabel}>
                      ศาล{' '}
                      <span className="font-normal text-muted-foreground">
                        (ถ้ามี)
                      </span>
                    </label>
                    <input
                      id="court-search"
                      type="search"
                      value={courtSearch}
                      onChange={(e) => setCourtSearch(e.target.value)}
                      className={inputClass}
                      placeholder="ค้นหาชื่อศาล"
                    />
                    <select
                      aria-label="เลือกศาล"
                      value={form.courtName}
                      onChange={(e) =>
                        setForm({ ...form, courtName: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="">ยังไม่ทราบศาล ระบุภายหลัง</option>
                      {courts
                        .filter(
                          (c) =>
                            c.name === form.courtName ||
                            c.name.includes(courtSearch.trim()),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    {!courts.length && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        ยังไม่มีข้อมูลศาล กรุณาโหลดใหม่หรือเพิ่มศาลในหน้าตั้งค่า
                      </p>
                    )}
                  </div>
                  {(['blackCaseNumber', 'redCaseNumber'] as const).map(
                    (key) => (
                      <div key={key}>
                        <label htmlFor={key} className={fieldLabel}>
                          {key === 'blackCaseNumber' ? 'เลขดำ' : 'เลขแดง'}{' '}
                          <span className="font-normal text-muted-foreground">
                            (ถ้ามี)
                          </span>
                        </label>
                        <input
                          id={key}
                          pattern={CASE_NUMBER_HTML}
                          title={CASE_NUMBER_HINT}
                          value={form[key]}
                          onChange={(e) =>
                            setForm({ ...form, [key]: e.target.value })
                          }
                          onBlur={() =>
                            setForm((f) => ({
                              ...f,
                              [key]: f[key]
                                .trim()
                                .replace(/[๐-๙]/g, (digit) =>
                                  String(digit.charCodeAt(0) - 3664),
                                )
                                .replace(/\s+/g, ''),
                            }))
                          }
                          className={inputClass}
                          placeholder="123/2569"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          เลขที่/ปี พ.ศ. · แปลงเลขไทยและตัดช่องว่างให้อัตโนมัติ
                        </p>
                      </div>
                    ),
                  )}
                </div>
              </section>

              <details className="rounded-lg border border-border p-4">
                <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  ข้อมูลเพิ่มเติม (ไม่บังคับ)
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="customer-ref" className={fieldLabel}>
                      เลขอ้างอิงลูกค้า
                    </label>
                    <input
                      id="customer-ref"
                      value={form.customerRef}
                      onChange={(e) =>
                        setForm({ ...form, customerRef: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="estimated-fee" className={fieldLabel}>
                      รายได้โดยประมาณ (บาท)
                    </label>
                    <input
                      id="estimated-fee"
                      type="number"
                      step="0.01"
                      min={FEE_MIN}
                      max={FEE_MAX}
                      value={form.estimatedFee}
                      onChange={(e) =>
                        setForm({ ...form, estimatedFee: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="description" className={fieldLabel}>
                      รายละเอียดคดี
                    </label>
                    <textarea
                      id="description"
                      rows={3}
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              </details>

              <section className="rounded-lg border border-border p-4">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.addInitialActivity}
                    onChange={(e) =>
                      setForm({ ...form, addInitialActivity: e.target.checked })
                    }
                  />
                  เพิ่มนัดหมายแรกพร้อมสร้างคดี
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  ถ้ายังไม่ทราบวันนัด เพิ่มภายหลังจากหน้าคดีได้
                </p>
                {form.addInitialActivity && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label htmlFor="activity-title" className={fieldLabel}>
                        หัวข้อนัดหมาย *
                      </label>
                      <input
                        id="activity-title"
                        required
                        value={form.initialActivityTitle}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            initialActivityTitle: e.target.value,
                          })
                        }
                        placeholder="เช่น นัดไกล่เกลี่ย"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="activity-type" className={fieldLabel}>
                        ประเภทนัดหมาย
                      </label>
                      <select
                        id="activity-type"
                        value={form.initialActivityType}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            initialActivityType: e.target.value,
                          })
                        }
                        className={inputClass}
                      >
                        {[
                          [ActivityType.COURT_DATE, 'นัดศาล'],
                          [ActivityType.CLIENT_MEETING, 'นัดลูกค้า'],
                          [ActivityType.FILING, 'ยื่นคำร้อง'],
                          [ActivityType.DEADLINE, 'กำหนดส่ง'],
                          [ActivityType.OTHER, 'อื่นๆ'],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="activity-at" className={fieldLabel}>
                        วันที่และเวลา *
                      </label>
                      <input
                        id="activity-at"
                        required
                        type="datetime-local"
                        value={form.initialActivityAt}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            initialActivityAt: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="activity-description"
                        className={fieldLabel}
                      >
                        รายละเอียดนัดหมาย (ไม่บังคับ)
                      </label>
                      <textarea
                        id="activity-description"
                        rows={2}
                        value={form.initialActivityDescription}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            initialActivityDescription: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                )}
              </section>
              {fieldSchema.length > 0 && (
                <section
                  className="space-y-4"
                  aria-label="ข้อมูลเฉพาะประเภทคดี"
                >
                  <div>
                    <h3 className="font-semibold">ข้อมูลเฉพาะประเภทคดี</h3>
                    <p className="text-sm text-muted-foreground">
                      รายละเอียดที่เกี่ยวข้องกับประเภทคดีที่เลือก
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fieldSchema.map((field) => (
                      <div key={field.key}>
                        <label
                          htmlFor={`custom-${field.key}`}
                          className={fieldLabel}
                        >
                          {field.label}
                          {field.required ? ' *' : ' (ไม่บังคับ)'}
                        </label>
                        {field.type === 'select' ? (
                          <select
                            id={`custom-${field.key}`}
                            required={field.required}
                            value={form.customFields[field.key] ?? ''}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                customFields: {
                                  ...form.customFields,
                                  [field.key]: e.target.value,
                                },
                              })
                            }
                            className={inputClass}
                          >
                            <option value="">เลือก{field.label}</option>
                            {field.options?.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            id={`custom-${field.key}`}
                            type={field.type}
                            step={field.type === 'number' ? 'any' : undefined}
                            required={field.required}
                            value={form.customFields[field.key] ?? ''}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                customFields: {
                                  ...form.customFields,
                                  [field.key]: e.target.value,
                                },
                              })
                            }
                            className={inputClass}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                เลขอ้างอิงสำนักงานและเลขแฟ้มสร้างอัตโนมัติเมื่อบันทึก
                {nextOwnRef ? ` · เลขอ้างอิงคาดการณ์ ${nextOwnRef}` : ''}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label htmlFor="lead-lawyer" className={fieldLabel}>
                  ทนายผู้รับผิดชอบ *
                </label>
                <select
                  id="lead-lawyer"
                  required
                  value={form.leadLawyerId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      leadLawyerId: e.target.value,
                      buddyIds: form.buddyIds.filter(
                        (id) => id !== e.target.value,
                      ),
                    })
                  }
                  className={inputClass}
                >
                  <option value="">เลือกทนายผู้รับผิดชอบ</option>
                  {lawyers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.firstName} {l.lastName}
                      {workloadLabel(l.id)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  {form.leadLawyerId === user?.id
                    ? 'เลือกคุณเป็นผู้รับผิดชอบเริ่มต้น เปลี่ยนได้ก่อนสร้างคดี'
                    : 'เลือกผู้รับผิดชอบหลัก 1 คน โดยดูภาระงานประกอบได้'}
                </p>
              </div>
              <details className="rounded-lg border border-border p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  เพิ่มทนายผู้ช่วย (ไม่บังคับ)
                  {form.buddyIds.length > 0
                    ? ` · เลือก ${form.buddyIds.length} คน`
                    : ''}
                </summary>
                <div className="mt-3 space-y-2">
                  {lawyers
                    .filter((l) => l.id !== form.leadLawyerId)
                    .map((l) => (
                      <label
                        key={l.id}
                        className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={form.buddyIds.includes(l.id)}
                          onChange={() => toggleBuddy(l.id)}
                        />
                        <span>
                          {l.firstName} {l.lastName}
                          <span className="block text-xs text-muted-foreground">
                            {workloadLabel(l.id)}
                          </span>
                        </span>
                      </label>
                    ))}
                  {lawyers.filter((l) => l.id !== form.leadLawyerId).length ===
                    0 && (
                    <p className="text-sm text-muted-foreground">
                      ไม่มีทนายคนอื่นให้เลือก
                    </p>
                  )}
                </div>
              </details>
              <section
                className="rounded-lg border border-border bg-muted/30 p-4"
                aria-labelledby="review-heading"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="review-heading" className="font-semibold">
                    ตรวจสอบก่อนสร้าง
                  </h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setStep(1);
                      setError('');
                    }}
                  >
                    แก้ไขข้อมูล
                  </Button>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ['ชื่อคดี', form.title],
                    [
                      'ประมาณการค่าใช้จ่าย',
                      `${(caseCostTotal(costLines).totalCents / 100).toLocaleString('th-TH')} บาท${caseCostTotal(costLines).incomplete ? ' (ยังกรอกอัตราไม่ครบ)' : ''}`,
                    ],
                    [
                      'ทุนทรัพย์',
                      form.claimedAmount
                        ? `${Number(form.claimedAmount).toLocaleString('th-TH')} บาท`
                        : 'ยังไม่ระบุ',
                    ],
                    ['ประเภทคดี', selectedType?.name],
                    ['ลูกค้า', displayClientName()],
                    [
                      'ศาล',
                      form.courtName
                        ? `${COURT_LEVEL_LABELS[form.courtLevel]} · ${form.courtName}`
                        : `${COURT_LEVEL_LABELS[form.courtLevel]} · ยังไม่ทราบศาล`,
                    ],
                    ['เลขดำ', form.blackCaseNumber || 'ยังไม่มี'],
                    ['เลขแดง', form.redCaseNumber || 'ยังไม่มี'],
                    [
                      'ผู้รับผิดชอบ',
                      selectedLawyer
                        ? `${selectedLawyer.firstName} ${selectedLawyer.lastName}`
                        : 'ยังไม่ได้เลือก',
                    ],
                    [
                      'ทนายผู้ช่วย',
                      lawyers
                        .filter((l) => form.buddyIds.includes(l.id))
                        .map((l) => `${l.firstName} ${l.lastName}`)
                        .join(', ') || 'ไม่มี',
                    ],
                    ...(form.customerRef
                      ? [['เลขอ้างอิงลูกค้า', form.customerRef]]
                      : []),
                    ...(form.estimatedFee
                      ? [
                          [
                            'รายได้โดยประมาณ',
                            `${Number(form.estimatedFee).toLocaleString('th-TH')} บาท`,
                          ],
                        ]
                      : []),
                    ...(form.description
                      ? [['รายละเอียดคดี', form.description]]
                      : []),
                    ...fieldSchema
                      .filter((f) => form.customFields[f.key])
                      .map((f) => [f.label, form.customFields[f.key]]),
                    ...(form.addInitialActivity
                      ? [
                          [
                            'นัดหมายแรก',
                            `${form.initialActivityTitle} · ${form.initialActivityAt.replace('T', ' ')}`,
                          ],
                          ...(form.initialActivityDescription
                            ? [
                                [
                                  'รายละเอียดนัดหมาย',
                                  form.initialActivityDescription,
                                ],
                              ]
                            : []),
                        ]
                      : []),
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 whitespace-pre-wrap font-medium">
                        {value || '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                  เลขอ้างอิงสำนักงานและเลขแฟ้มจะสร้างอัตโนมัติเมื่อกด “สร้างคดี”
                </p>
              </section>
            </div>
          )}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-border bg-card pl-4 pr-20 py-4 sm:px-6">
          <Button
            type="button"
            variant="outline"
            disabled={submitting || analysisBusy || !!createdCaseId}
            onClick={goBack}
          >
            {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
          </Button>
          <Button
            type="submit"
            disabled={
              submitting ||
              analysisBusy ||
              loadingTypes ||
              (step === 0 && !caseTypes.length)
            }
          >
            {submitting
              ? 'กำลังบันทึก…'
              : step === 2
                ? createdCaseId
                  ? 'แนบไฟล์ที่เหลืออีกครั้ง'
                  : 'สร้างคดี'
                : 'ถัดไป'}
          </Button>
        </div>
      </form>
      {/*
        Optional and credit-metered, so it sits below the form as a closed
        disclosure: the required fields come first and the AI helper never
        pushes them off-screen.
      */}
      <details className="group mt-6 rounded-xl border border-border bg-card shadow-soft">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">
            ▸
          </span>
          วิเคราะห์เนื้อหาไฟล์ด้วย AI (ไม่บังคับ)
        </summary>
        <div className="border-t border-border p-4 sm:p-6">
          <div>
            <BatchAnalysisPanel
              files={files}
              onFilesChange={setFiles}
              onBusyChange={setAnalysisBusy}
              onFieldSuggestions={setSuggestions}
              disabled={submitting || !!createdCaseId}
              onUseSummary={(summary) =>
                setForm((previous) => ({
                  ...previous,
                  description: [previous.description, summary]
                    .filter(Boolean)
                    .join('\n\n'),
                }))
              }
            />
          </div>
          {suggestions.length > 0 && (
            <div className="mt-4">
              <SuggestedFieldsPanel
                suggestions={suggestions}
                accepts={['title', 'courtName', 'claimedAmount']}
                current={{
                  title: form.title,
                  courtName: form.courtName,
                  claimedAmount: form.claimedAmount,
                }}
                onApply={(field, value) =>
                  setForm((previous) => ({ ...previous, [field]: value }))
                }
              />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
