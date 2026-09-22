'use client';

// Hallmark · genre: modern-minimal · macrostructure: Workbench · tone: soft · anchor: Samnuan blue
// Hallmark · contrast: pass (40–41) · responsive: pass (34, 49–57) · pre-emit: P5 H5 E4 S5 R5 V5

import { CaseCostCalculator } from '@/components/cases/CaseCostCalculator';
import {
  CASE_COSTS_KEY,
  initialCaseCosts,
  caseCostTotal,
} from '@/lib/case-costs';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { ClientCombobox } from './ClientCombobox';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';
import { CargoClaimFields } from '@/components/cargo/CargoClaimFields';
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
  CargoClaimInput,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X } from 'lucide-react';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { ThaiDateTimeInput } from '@/components/ui/ThaiDateTimeInput';
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
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [playbookId, setPlaybookId] = useState('');
  const [cargoClaimEnabled, setCargoClaimEnabled] = useState(false);
  const [cargoClaim, setCargoClaim] = useState<CargoClaimInput>({ currency: 'THB' });

  const [form, setForm] = useState({
    caseTypeId: '',
    customerRef: '',
    title: '',
    clientId: '',
    clientName: '',
    clientType: 'INDIVIDUAL',
    useTmpClient: false,
    courtName: '',
    courtLevel: CourtLevel.TRIAL as CourtLevel,
    blackCaseNumber: '',
    redCaseNumber: '',
    description: '',
    chargeSection: '',
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
  // ลูกค้า = ผู้ว่าจ้าง/ผู้จ่ายเงิน (เช่น บริษัทประกัน) ต่างจากลูกความที่เราว่าความให้ (form.clientId)
  const [customers, setCustomers] = useState<{ customerId: string; sharePercent: string; contactId?: string }[]>([
    { customerId: '', sharePercent: '', contactId: '' },
  ]);
  const [sameCustomer, setSameCustomer] = useState(false);
  // ลูกความคนอื่น (เกินคนที่ 1) — เช่น หลายคนร่วมฟ้อง/ถูกฟ้อง
  const [additionalClients, setAdditionalClients] = useState<{ clientId: string }[]>([]);
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

  useEffect(() => {
    if (!token) return;
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(setPlaybooks).catch(() => setPlaybooks([]));
  }, [token]);

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
  // ลูกค้าคนเดียวกับลูกความ — ตราบใดที่ติ้กไว้ ผู้มอบหมายรายที่ 1 เป็นตัวกำหนด ลูกความตามไปด้วย
  useEffect(() => {
    if (!sameCustomer) return;
    const customerId = customers[0]?.customerId ?? '';
    const client = clients.find((c) => c.id === customerId);
    setForm((f) => ({
      ...f,
      clientId: customerId,
      clientName: client?.name ?? '',
      useTmpClient: false,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameCustomer, customers[0]?.customerId, clients]);

  const displayClientName = () => {
    if (form.clientId) {
      return clients.find((c) => c.id === form.clientId)?.name ?? '';
    }
    if (form.useTmpClient) return TMP_CLIENT_PLACEHOLDER;
    return form.clientName.trim() || TMP_CLIENT_PLACEHOLDER;
  };

  const validationMessage = (targetStep: number) => {
    if (targetStep === 0) {
      if (!form.caseTypeId) return 'เลือกประเภทคดีก่อนดำเนินการต่อ';
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
        return `หมายเลขคดีดำ: ${CASE_NUMBER_HINT}`;
      if (
        form.redCaseNumber.trim() &&
        !CASE_NUMBER_REGEX.test(form.redCaseNumber.trim())
      )
        return `หมายเลขคดีแดง: ${CASE_NUMBER_HINT}`;
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
        (f) => f.required && !(f.key === 'chargeSection' ? form.chargeSection : form.customFields[f.key])?.trim(),
      );
      if (missing) return `กรุณากรอก${missing.label}`;
    }
    if (targetStep === 1 && !lawyers.some((l) => l.id === form.leadLawyerId))
      return 'กรุณาเลือกทนายผู้รับผิดชอบ';
    return '';
  };
  // Type-specific fields live inside "ข้อมูลคดี": a step of their own made
  // lawyers click through a page holding one or two optional inputs.
  const visibleSteps = [
    { value: 0, label: 'ข้อมูลคดี' },
    { value: 1, label: 'ทีมและตรวจสอบ' },
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
          chargeSection: form.chargeSection.trim(),
          [CASE_COSTS_KEY]: JSON.stringify(costLines),
        },
        cargoClaimEnabled,
        cargoClaim: cargoClaimEnabled ? cargoClaim : undefined,
      };
      if (form.clientId) {
        payload.clientId = form.clientId;
        const client = clients.find((c) => c.id === form.clientId);
        if (client) payload.clientName = client.name;
      } else if (!form.useTmpClient && form.clientName.trim()) {
        // A typed-in new client becomes a real registry entry (with its
        // chosen type) so it shows up in the client list from day one.
        const createdClient = await api.createClient(token!, {
          name: form.clientName.trim(),
          type: form.clientType,
          contacts: [{ name: form.clientName.trim(), isPrimary: true }],
        });
        payload.clientId = createdClient.id;
        payload.clientName = createdClient.name;
      } else {
        payload.clientName = TMP_CLIENT_PLACEHOLDER;
      }
      const pickedCustomers = customers.filter((c) => c.customerId);
      if (pickedCustomers.length) {
        payload.customers = pickedCustomers.map((c, index) => ({
          customerId: c.customerId,
          contactId: c.contactId || undefined,
          sharePercent: c.sharePercent ? Number(c.sharePercent) : undefined,
          isPrimary: index === 0,
        }));
      }
      const pickedClients = additionalClients.filter((c) => c.clientId);
      if (pickedClients.length) {
        payload.clients = pickedClients.map((c) => ({ clientId: c.clientId }));
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
      if (playbookId) {
        await setupRequest(token, `/cases/${created.id}/apply`, { releaseId: playbookId }).catch(console.error);
      }
      router.push(`/cases/${created.id}${cargoClaimEnabled ? '?tab=cargo-claim' : ''}`);
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
    'mt-1 min-h-11 min-w-0 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
  const fieldLabel = 'block text-sm font-medium';
  const selectedLawyer = lawyers.find((l) => l.id === form.leadLawyerId);
  const currentIndex = visibleSteps.findIndex((item) => item.value === step);
  const primaryCustomerName = customers[0]?.customerId
    ? (clients.find((client) => client.id === customers[0].customerId)?.name ??
      'กำลังโหลด…')
    : 'ยังไม่ระบุ';
  const overviewClientName = form.clientId
    ? (clients.find((client) => client.id === form.clientId)?.name ??
      'กำลังโหลด…')
    : form.useTmpClient
      ? TMP_CLIENT_PLACEHOLDER
      : form.clientName.trim() || 'ยังไม่ระบุ';

  return (
    <div
      data-hallmark="soft-workbench"
      className="mx-auto w-full max-w-7xl min-w-0 pb-24 [overflow-wrap:anywhere]"
    >
      <header className="mb-6 border-b border-border/70 pb-5 sm:pb-6">
        <Link
          href="/cases"
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:text-primary"
        >
          ← กลับไปหน้าคดี
        </Link>
        <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              สร้างคดีใหม่
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              ระบุข้อมูลเท่าที่มีในตอนนี้ ข้อมูลศาล เลขคดี
              และรายละเอียดเสริมเติมภายหลังได้
            </p>
          </div>
          <p className="w-fit whitespace-nowrap rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            {nextOwnRef ? `เลขอ้างอิงคาดการณ์ ${nextOwnRef}` : 'เลขอ้างอิงสร้างอัตโนมัติ'}
          </p>
        </div>
      </header>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-8">
        <div className="min-w-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (step === 1) void handleSubmit();
              else goNext();
            }}
            className="min-w-0 space-y-4 text-card-foreground"
          >
            <fieldset
              disabled={submitting || analysisBusy || !!createdCaseId}
              className="min-w-0 space-y-4"
            >
          <div className="rounded-2xl border border-primary/10 bg-primary/[0.035] p-4 sm:p-5">
            <p className="text-xs font-medium text-primary">
              ขั้นตอน {currentIndex + 1} จาก {visibleSteps.length}
            </p>
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 text-xl font-semibold tracking-tight focus:outline-none"
            >
              {visibleSteps[currentIndex]?.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === 0
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
            <div className="space-y-6 rounded-2xl border border-border/80 bg-card p-4 shadow-soft sm:p-6">
              <section className="space-y-3" aria-label="ประเภทคดี">
                <div className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-2 h-px w-5 shrink-0 bg-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">ประเภทคดี</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      เลือกประเภทที่ตรงกับคดี เพื่อแสดงเฉพาะข้อมูลที่เกี่ยวข้อง
                    </p>
                  </div>
                </div>
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
                        onClick={() => {
                          setForm((f) =>
                            f.caseTypeId === type.id
                              ? f
                              : { ...f, caseTypeId: type.id, customFields: {} },
                          );
                          setPlaybookId((current) => current || playbooks.find((p) => p.caseTypeId === type.id)?.id || current);
                        }}
                        className={`min-h-11 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/10 sm:p-4 ${form.caseTypeId === type.id ? 'border-primary/50 bg-primary/[0.055]' : 'border-border bg-background hover:border-primary/25 hover:bg-muted/60'}`}
                      >
                        <span className="flex items-center justify-between gap-2 font-medium">
                          {type.name}
                          <span
                            aria-hidden="true"
                            className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${form.caseTypeId === type.id ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent'}`}
                          >
                            ✓
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
              </section>

              <section className="space-y-4 border-t border-border pt-5" aria-label="Cargo Claim">
                <label className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4">
                  <Checkbox
                    className="mt-0.5"
                    checked={cargoClaimEnabled}
                    onChange={(event) => setCargoClaimEnabled(event.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-semibold">คดีเรียกร้องค่าสินค้าจากการขนส่ง (Cargo Claim)</span>
                    <span className="mt-1 block text-xs text-muted-foreground">ใช้ Cargo Claim Assessment Playbook รุ่นล่าสุด พร้อม checklist เอกสารและพื้นที่วิเคราะห์ Liability / Time Bar โดยไม่ต้องผ่าน Intake</span>
                  </span>
                </label>
                {cargoClaimEnabled && (
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <CargoClaimFields value={cargoClaim} onChange={setCargoClaim} />
                  </div>
                )}
              </section>

              {cargoClaimEnabled && <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary">ระบบจะผูก Cargo Claim Playbook และสร้างงานมาตรฐานให้อัตโนมัติหลังเปิดคดี</p>}

              {playbooks.length > 0 && !cargoClaimEnabled && (
                <section className="space-y-2 border-t border-border pt-5" aria-label="Playbook">
                  <label className="block text-sm font-medium" htmlFor="new-case-playbook">
                    Playbook (ถ้ามี — สร้างงานให้อัตโนมัติหลังเปิดคดี)
                  </label>
                  <select
                    id="new-case-playbook"
                    className="h-11 w-full rounded-lg border bg-background px-3 text-sm sm:w-96"
                    value={playbookId}
                    onChange={(e) => setPlaybookId(e.target.value)}
                  >
                    <option value="">— ไม่ใช้ Playbook —</option>
                    {playbooks.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · v{p.version}
                        {p.caseTypeId === form.caseTypeId ? ' (แนะนำ)' : ''}
                      </option>
                    ))}
                  </select>
                </section>
              )}

              <section className="space-y-4 border-t border-border pt-5" aria-label="ลูกค้า ลูกความ และชื่อคดี">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-px w-5 shrink-0 bg-primary" />
                  <h3 className="text-sm font-semibold">ลูกค้า ลูกความ และชื่อคดี</h3>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={fieldLabel}>บริษัทประกัน / ผู้มอบหมายงาน (ลูกค้า)</span>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    คนที่จ้างเราและเป็นคนจ่าย เช่น บริษัทประกันที่จ้างให้ว่าความให้ผู้เอาประกัน — ถ้าลูกความจ่ายเอง เลือกคนเดียวกันได้ที่นี่
                  </p>
                  <div className="space-y-2">
                    {customers.map((row, index) => (
                      <div key={index} className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <CustomerSelect
                            id={`case-customer-${index}`}
                            label={`ผู้มอบหมายรายที่ ${index + 1}`}
                            value={row.customerId}
                            clients={clients}
                            onChange={(customerId) =>
                              setCustomers((rows) =>
                                rows.map((r, i) => (i === index ? { ...r, customerId } : r)),
                              )
                            }
                            onCreated={(client) =>
                              setClients((rows) =>
                                [...rows, client].sort((a, b) => a.name.localeCompare(b.name, 'th')),
                              )
                            }
                          />
                    {(() => {
                      const contacts = clients.find((c) => c.id === row.customerId)?.contacts ?? [];
                      return row.customerId && contacts.length > 0 ? (
                        <select
                          aria-label={`คนติดต่อของผู้มอบหมายรายที่ ${index + 1}`}
                          value={row.contactId ?? ''}
                          onChange={(e) =>
                            setCustomers((rows) =>
                              rows.map((r, i) => (i === index ? { ...r, contactId: e.target.value } : r)),
                            )
                          }
                          className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                        >
                          <option value="">คนติดต่อฝั่งลูกค้า — ไม่ระบุ</option>
                          {contacts.map((ct) => (
                            <option key={ct.id} value={ct.id}>{ct.name}{ct.phone ? ` · ${ct.phone}` : ''}</option>
                          ))}
                        </select>
                      ) : null;
                    })()}
                        </div>
                        {customers.length > 1 && (
                          <input
                            aria-label={`สัดส่วนที่จ่ายของรายที่ ${index + 1}`}
                            value={row.sharePercent}
                            onChange={(e) =>
                              setCustomers((rows) =>
                                rows.map((r, i) => (i === index ? { ...r, sharePercent: e.target.value } : r)),
                              )
                            }
                            placeholder="%"
                            className="h-10 w-16 rounded-lg border border-input bg-background px-2 text-center text-sm"
                          />
                        )}
                        {customers.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`ลบลูกค้ารายที่ ${index + 1}`}
                            onClick={() => setCustomers((rows) => rows.filter((_, i) => i !== index))}
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomers((rows) => [...rows, { customerId: '', sharePercent: '', contactId: '' }])}
                    >
                      <Plus className="h-3.5 w-3.5" /> เพิ่มผู้จ่ายอีกราย
                    </Button>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={sameCustomer}
                        onChange={(e) => setSameCustomer(e.target.checked)}
                      />
                      ลูกความคนเดียวกับผู้มอบหมายรายที่ 1
                    </label>
                  </div>
                </div>

                <div>
                  <label htmlFor="client-combobox" className={fieldLabel}>
                    ลูกความ{' '}
                    <span className="font-normal text-muted-foreground">
                      (ผู้ที่เราว่าความให้ — เพิ่มภายหลังได้)
                    </span>
                  </label>
                  <ClientCombobox
                    id="client-combobox"
                    clients={clients}
                    clientId={form.clientId}
                    clientName={form.clientName}
                    disabled={form.useTmpClient || sameCustomer}
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
                  {sameCustomer && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      ใช้ค่าเดียวกับผู้มอบหมายรายที่ 1 — ยกเลิกติ๊กด้านบนเพื่อเลือกลูกความอื่น
                    </p>
                  )}
                  {!form.clientId && !sameCustomer && form.clientName.trim() && !form.useTmpClient && (
                    <div className="mt-2 space-y-1">
                      <label className="block text-xs font-medium text-muted-foreground">
                        ลูกความใหม่ — เลือกประเภท (สร้างทะเบียนลูกค้าให้อัตโนมัติตอนบันทึก)
                      </label>
                      <select
                        value={form.clientType}
                        onChange={(e) => setForm({ ...form, clientType: e.target.value })}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
                      >
                        <option value="INDIVIDUAL">บุคคลธรรมดา</option>
                        <option value="COMPANY">นิติบุคคล</option>
                      </select>
                    </div>
                  )}
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={form.useTmpClient}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          useTmpClient: e.target.checked,
                          clientId: e.target.checked ? '' : form.clientId,
                        })
                      }
                    />
                    ยังไม่ทราบชื่อลูกความ ระบุภายหลัง
                  </label>
                  {form.useTmpClient && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      จะใช้ชื่อ "{TMP_CLIENT_PLACEHOLDER}" ชั่วคราว
                      ยกเลิกเครื่องหมายเพื่อกลับไปกรอกชื่อ
                    </p>
                  )}
                  {additionalClients.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {additionalClients.map((row, index) => (
                        <div key={index} className="flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <CustomerSelect
                              id={`case-additional-client-${index}`}
                              label={`ลูกความรายที่ ${index + 2}`}
                              value={row.clientId}
                              clients={clients}
                              onChange={(clientId) =>
                                setAdditionalClients((rows) =>
                                  rows.map((r, i) => (i === index ? { ...r, clientId } : r)),
                                )
                              }
                              onCreated={(client) =>
                                setClients((rows) =>
                                  [...rows, client].sort((a, b) => a.name.localeCompare(b.name, 'th')),
                                )
                              }
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`ลบลูกความรายที่ ${index + 2}`}
                            onClick={() => setAdditionalClients((rows) => rows.filter((_, i) => i !== index))}
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setAdditionalClients((rows) => [...rows, { clientId: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> เพิ่มลูกความอีกราย
                  </Button>
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
                <label htmlFor="case-charge-section" className={fieldLabel}>ข้อหาหรือฐานความผิด{fieldSchema.some(f => f.key === 'chargeSection' && f.required) ? ' *' : ' (ไม่บังคับ)'}</label>
                <textarea id="case-charge-section" rows={2} maxLength={2000} value={form.chargeSection} onChange={e => setForm({ ...form, chargeSection: e.target.value })} placeholder="เช่น ละเมิด เรียกค่าเสียหาย / ผิดสัญญา" className={inputClass} />
                <p className="mt-1 text-xs text-muted-foreground">ใช้แสดงในหน้าคดี คำฟ้องหน้าแรก และปกสำนวน</p>
              </div>

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
              <section className="border-t border-border pt-5">
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
              <details
                className="space-y-4 border-t border-border pt-5"
                aria-labelledby="court-heading"
              >
                <summary id="court-heading" className="cursor-pointer text-sm font-semibold">
                  ข้อมูลศาลและหมายเลขคดี (เติมภายหลังได้)
                </summary>
                <p className="text-xs text-muted-foreground">
                  ยังไม่มีหมายเลขคดีดำ/หมายเลขคดีแดงก็เปิดคดีได้
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
                          {key === 'blackCaseNumber' ? 'หมายเลขคดีดำ' : 'หมายเลขคดีแดง'}{' '}
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
              </details>

              <details className="border-t border-border pt-5">
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

              <section className="border-t border-border pt-5">
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
                    <div className="sm:col-span-2">
                      <label htmlFor="activity-at" className={fieldLabel}>
                        วันที่และเวลา *
                      </label>
                      <ThaiDateTimeInput
                        id="activity-at"
                        required
                        className="mt-1"
                        value={form.initialActivityAt}
                        onChange={(v) =>
                          setForm({
                            ...form,
                            initialActivityAt: v,
                          })
                        }
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
              {fieldSchema.some(field => field.key !== 'chargeSection') && (
                <section
                  className="space-y-4"
                  aria-label="ข้อมูลเฉพาะประเภทคดี"
                >
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="h-px w-5 shrink-0 bg-primary" />ข้อมูลเฉพาะประเภทคดี</h3>
                    <p className="text-sm text-muted-foreground">
                      รายละเอียดที่เกี่ยวข้องกับประเภทคดีที่เลือก
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fieldSchema.filter(field => field.key !== 'chargeSection').map((field) => (
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

          {step === 1 && (
            <div className="space-y-6 rounded-2xl border border-border/80 bg-card p-4 shadow-soft sm:p-6">
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
              <div>
                <label className={fieldLabel}>
                  ทีมผู้รับผิดชอบเพิ่มเติม (ไม่บังคับ)
                </label>
                <MultiUserSelect
                  users={lawyers.filter((l) => l.id !== form.leadLawyerId)}
                  value={form.buddyIds}
                  onChange={(ids) => setForm({ ...form, buddyIds: ids })}
                  placeholder="เลือกทนายผู้ช่วย — เลือกได้หลายคน"
                  renderExtra={(l) => workloadLabel(l.id) || ''}
                />
                {form.buddyIds.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">เลือกแล้ว {form.buddyIds.length} คน</p>
                )}
              </div>
              <section
                className="border-t border-border pt-5"
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
                      setStep(0);
                      setError('');
                    }}
                  >
                    แก้ไขข้อมูล
                  </Button>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ['ชื่อคดี', form.title],
                    ['ข้อหาหรือฐานความผิด', form.chargeSection || 'ยังไม่ระบุ'],
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
                    ['หมายเลขคดีดำ', form.blackCaseNumber || 'ยังไม่มี'],
                    ['หมายเลขคดีแดง', form.redCaseNumber || 'ยังไม่มี'],
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
                      .filter((f) => f.key !== 'chargeSection' && form.customFields[f.key])
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card py-3 pl-4 pr-20 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-nowrap active:bg-accent/80"
            disabled={submitting || analysisBusy || !!createdCaseId}
            onClick={goBack}
          >
            {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
          </Button>
          <Button
            type="submit"
            className="min-h-11 whitespace-nowrap px-5 active:bg-primary/80"
            disabled={
              submitting ||
              analysisBusy ||
              loadingTypes ||
              (step === 0 && !caseTypes.length)
            }
          >
            {submitting
              ? 'กำลังบันทึก…'
              : step === 1
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
          <details className="group mt-5 rounded-2xl border border-border/80 bg-card shadow-soft">
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

        <aside
          aria-label="ภาพรวมคดีใหม่"
          className="order-first min-w-0 space-y-3 lg:order-last lg:sticky lg:top-4"
        >
          <nav
            aria-label="ขั้นตอนสร้างคดี"
            className="rounded-2xl border border-border/80 bg-card p-3 shadow-soft"
          >
            <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">
              ขั้นตอนสร้างคดี
            </p>
            <ol className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {visibleSteps.map((item, index) => (
                <li key={item.value} className="min-w-0">
                  <button
                    type="button"
                    disabled={item.value > step || submitting}
                    aria-current={item.value === step ? 'step' : undefined}
                    onClick={() => {
                      setStep(item.value);
                      setError('');
                    }}
                    className={`flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted ${item.value === step ? 'bg-primary/[0.07] text-primary' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${item.value <= step ? 'border-primary/30 bg-background text-primary' : 'border-border bg-muted/40'}`}
                    >
                      {item.value < step ? '✓' : index + 1}
                    </span>
                    <span className="min-w-0 truncate whitespace-nowrap">
                      {item.label}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <section className="hidden rounded-2xl border border-border/70 bg-muted/30 p-4 lg:block">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">ภาพรวมคดี</h2>
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                บันทึกเมื่อสร้าง
              </span>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              {[
                ['ประเภทคดี', selectedType?.name || 'ยังไม่เลือก'],
                ['ผู้มอบหมาย', primaryCustomerName],
                ['ลูกความ', overviewClientName],
                ['ชื่อคดี', form.title.trim() || 'ระบบช่วยตั้งชื่อให้'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] gap-2 border-t border-border/60 pt-3 first:border-0 first:pt-0"
                >
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 break-words text-right text-xs font-medium leading-5">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 rounded-xl bg-background/80 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              กรอกเฉพาะข้อมูลที่ยืนยันได้ ส่วนข้อมูลศาลและเลขคดีเพิ่มภายหลังได้
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
