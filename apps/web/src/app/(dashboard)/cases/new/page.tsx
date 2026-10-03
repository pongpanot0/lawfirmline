'use client';

// Hallmark · genre: modern-minimal · fingerprint: hanging / single-column / hairline / solid-primary / no-imagery / no-reveal · tone: soft · anchor: Samnuan blue
// Hallmark · contrast: pass (40–41) · responsive: pass (34, 49–57) · pre-emit: P5 H5 E4 S5 R5 V5

import { ClientCombobox } from './ClientCombobox';
import { latestPlaybookReleases, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';
import { CreateClientContactDialog } from '@/components/intake/CreateClientContactDialog';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  api,
  UserItem,
  CaseTypeItem,
  ClientItem,
  ApiError,
  WorkloadSummary,
  FieldSuggestion,
  SuggestibleField,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/misc';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X } from 'lucide-react';
import type { CaseFieldSchema } from '@lawfirm/shared';
import {
  TMP_CLIENT_PLACEHOLDER,
  CourtLevel,
  FEE_MAX,
  CARGO_CLAIM_PLAYBOOK_KEY,
  CARGO_CLAIM_PLAYBOOK_NAME,
} from '@lawfirm/shared';

export default function NewCasePage() {
  return <Suspense fallback={<PageLoading title="กำลังโหลดข้อมูลเปิดคดี" lines={3} />}><NewCaseForm /></Suspense>;
}

function NewCaseForm() {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedClientId = searchParams.get('clientId') ?? '';
  const requestedSopId = searchParams.get('sop') ?? '';
  const clientContextApplied = useRef(false);
  const submittingRef = useRef(false);
  const createdCaseId = useRef('');
  const pendingUploads = useRef<File[]>([]);
  const playbookManuallySelected = useRef(Boolean(requestedSopId));
  const [autoTitle, setAutoTitle] = useState(true);
  const [retry, setRetry] = useState(0);
  const [lookupWarning, setLookupWarning] = useState('');
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [workload, setWorkload] = useState<WorkloadSummary[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [playbookId, setPlaybookId] = useState(requestedSopId);
  const [cargoClaimEnabled, setCargoClaimEnabled] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);

  const [form, setForm] = useState({
    caseTypeId: '',
    title: '',
    ownRef: '',
    clientId: '',
    clientName: '',
    clientType: 'INDIVIDUAL',
    useTmpClient: false,
    chargeSection: '',
    description: '',
    courtName: '',
    claimedAmount: '',
    leadLawyerId: '',
    customFields: {} as Record<string, string>,
  });
  // ลูกค้า = ผู้ว่าจ้าง/ผู้จ่ายเงิน (เช่น บริษัทประกัน) ต่างจากลูกความที่เราว่าความให้ (form.clientId)
  const [customers, setCustomers] = useState<{ customerId: string; sharePercent: string; contactId?: string }[]>([
    { customerId: '', sharePercent: '', contactId: '' },
  ]);
  const [sameCustomer, setSameCustomer] = useState(false);
  const [contactDialogCustomerIndex, setContactDialogCustomerIndex] = useState<number | null>(null);
  const [nextOwnRef, setNextOwnRef] = useState<string>('');

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
          'โหลดรายชื่อลูกค้าไม่สำเร็จ ลองโหลดใหม่ก่อนกรอกต่อ',
        );
        return [] as ClientItem[];
      }),
      api.getNextOwnRef(token).catch(() => ({ ownRef: '' })),
      api.getWorkloadSummary(token).catch(() => [] as WorkloadSummary[]),
    ])
      .then(
        ([lawyerList, types, clientList, nextRef, workloadList]) => {
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
          if (requestedClientId && !clientContextApplied.current) {
            const client = clientList.find((c) => c.id === requestedClientId);
            if (client) {
              setForm((f) => ({ ...f, clientId: client.id, clientName: client.name, clientType: client.type ?? 'INDIVIDUAL', useTmpClient: false }));
              clientContextApplied.current = true;
            } else {
              setLookupWarning('ไม่พบลูกค้าที่เลือก กรุณาโหลดใหม่หรือเลือกลูกความก่อนเปิดคดี');
            }
          }
          setNextOwnRef(nextRef.ownRef);
          setWorkload(workloadList);
        },
      )
      .catch(() => setError('โหลดข้อมูลฟอร์มไม่สำเร็จ กรุณาลองใหม่'))
      .finally(() => setLoadingTypes(false));
  }, [token, user?.id, retry, requestedClientId]);

  useEffect(() => {
    if (!token) return;
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(items => setPlaybooks(latestPlaybookReleases(items))).catch(() => setPlaybooks([]));
  }, [token]);

  useEffect(() => {
    if (!form.caseTypeId || !playbooks.length || playbookManuallySelected.current || cargoClaimEnabled) return;
    setPlaybookId(playbooks.find((playbook) => playbook.caseTypeId === form.caseTypeId)?.id ?? '');
  }, [form.caseTypeId, playbooks, cargoClaimEnabled]);

  useEffect(() => {
    if (nextOwnRef && !form.ownRef) {
      setForm((f) => ({ ...f, ownRef: nextOwnRef }));
    }
  }, [nextOwnRef, form.ownRef]);

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

  const validationMessage = () => {
    if (!form.caseTypeId) return 'เลือกประเภทคดีก่อนดำเนินการต่อ';
    if (!form.title.trim()) return 'กรุณากรอกชื่อคดี';
    const missing = fieldSchema.find(
      (f) => f.required && !(f.key === 'chargeSection' ? form.chargeSection : form.customFields[f.key])?.trim(),
    );
    if (missing) return `กรุณากรอก${missing.label}`;
    if (!lawyers.some((l) => l.id === form.leadLawyerId))
      return 'กรุณาเลือกทนายผู้รับผิดชอบ';
    return '';
  };
  const handleSubmit = async () => {
    if (!token || submittingRef.current) return;
    if (!createdCaseId.current) {
      if (requestedClientId && !clientContextApplied.current && !form.clientId && !form.clientName.trim() && !form.useTmpClient) {
        setError('ไม่พบลูกค้าที่เลือก กรุณาเลือกลูกความหรือพิมพ์ชื่อใหม่ก่อนเปิดคดี');
        return;
      }
      const message = validationMessage();
      if (message) {
        setError(message);
        return;
      }
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      if (!createdCaseId.current) {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        ownRef: form.ownRef.trim() || undefined,
        ownRefSuggested: nextOwnRef || undefined,
        description: form.description.trim() || undefined,
        courtName: form.courtName.trim() || undefined,
        claimedAmount: form.claimedAmount ? Number(form.claimedAmount) : undefined,
        courtLevel: CourtLevel.TRIAL,
        leadLawyerId: form.leadLawyerId,
        caseTypeId: form.caseTypeId,
        customFields: {
          ...form.customFields,
          ...(form.chargeSection.trim() ? { chargeSection: form.chargeSection.trim() } : {}),
        },
        cargoClaimEnabled,
      };
      const typedClient = clients.find((client) => client.name.trim().toLocaleLowerCase() === form.clientName.trim().toLocaleLowerCase());
      if (form.clientId) {
        payload.clientId = form.clientId;
        const client = clients.find((c) => c.id === form.clientId);
        if (client) payload.clientName = client.name;
      } else if (!form.useTmpClient && form.clientName.trim() && typedClient) {
        payload.clientId = typedClient.id;
        payload.clientName = typedClient.name;
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
      const created = (await api.createCase(token, payload)) as { id: string };
      createdCaseId.current = created.id;
      pendingUploads.current = files;
      }
      const failed: File[] = [];
      for (const file of pendingUploads.current) {
        try {
          await api.uploadDocument(token, createdCaseId.current, file);
        } catch {
          failed.push(file);
        }
      }
      pendingUploads.current = failed;
      setUploadFailures(failed.map((file) => file.name));
      if (failed.length) {
        setError(`สร้างคดีแล้ว แต่อัปโหลดเอกสารไม่สำเร็จ: ${failed.map((file) => file.name).join(', ')} — กดลองอีกครั้งได้โดยไม่สร้างคดีซ้ำ`);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      router.push(`/cases/${createdCaseId.current}${cargoClaimEnabled ? '?tab=cargo-claim' : `?tab=tasks${playbookId ? `&sop=${encodeURIComponent(playbookId)}` : ''}`}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : createdCaseId.current
            ? 'สร้างคดีแล้ว แต่ขั้นตอนถัดไปไม่สำเร็จ กรุณาลองใหม่'
            : 'สร้างคดีไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่',
      );
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const applySuggestion = (field: SuggestibleField, value: string) => {
    if (field === 'title') setAutoTitle(false);
    setForm((current) => {
      if (field === 'title' || field === 'courtName' || field === 'claimedAmount')
        return { ...current, [field]: value };
      return { ...current, customFields: { ...current.customFields, [field]: field === 'incidentDate' ? value.slice(0, 10) : value } };
    });
  };

  const inputClass =
    'mt-1 min-h-11 min-w-0 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm transition-colors hover:border-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60';
  const fieldLabel = 'block text-sm font-medium';

  return (
    <div
      data-hallmark="case-create-flow"
      className="mx-auto w-full max-w-3xl min-w-0 pb-24 [overflow-wrap:anywhere]"
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
              เลือกประเภทคดี ตั้งชื่อ และระบุทนาย ก็เริ่มคดีได้ · ข้อมูลอื่นเติมภายหลังได้
            </p>
          </div>
          <p className="w-fit whitespace-nowrap rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            {nextOwnRef ? `เลขอ้างอิงคาดการณ์ ${nextOwnRef}` : 'เลขอ้างอิงสร้างอัตโนมัติ'}
          </p>
        </div>
      </header>

      <div className="min-w-0">
        <div className="min-w-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
            onInvalidCapture={(event) => {
              const details = (event.target as HTMLElement).closest('details');
              if (details) details.open = true;
            }}
            className="min-w-0 space-y-4 text-card-foreground"
          >
            <fieldset
              disabled={submitting || !!createdCaseId.current}
              className="min-w-0 space-y-4"
            >
          {(error || lookupWarning) && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p>{error || lookupWarning}</p>
              {createdCaseId.current && (
                <Link className="mt-2 inline-block underline" href={`/cases/${createdCaseId.current}?tab=documents`}>
                  ไปยังคดีที่สร้างแล้ว
                </Link>
              )}
              {(caseTypes.length === 0 || lookupWarning) && (
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

            <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-soft sm:p-6">
              <label htmlFor="case-type" className={fieldLabel}>ประเภทคดี <span className="text-destructive">*</span>
                <select id="case-type" required disabled={loadingTypes} value={form.caseTypeId} className={inputClass}
                  onChange={(event) => setForm((current) => current.caseTypeId === event.target.value ? current : {
                    ...current, caseTypeId: event.target.value, chargeSection: '',
                    customFields: {
                      opposingParty: current.customFields.opposingParty ?? '',
                      incidentDate: current.customFields.incidentDate ?? '',
                      estimatedDamage: current.customFields.estimatedDamage ?? '',
                    },
                  })}>
                  <option value="">{loadingTypes ? 'กำลังโหลดประเภทคดี…' : 'เลือกประเภทคดี'}</option>
                  {caseTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              <div>
                <label htmlFor="client-combobox" className={fieldLabel}>ลูกความ <span className="font-normal text-muted-foreground">(เติมภายหลังได้)</span></label>
                <ClientCombobox id="client-combobox" clients={clients} clientId={form.clientId} clientName={form.clientName}
                  disabled={form.useTmpClient || sameCustomer}
                  onSelectClient={(client) => setForm({ ...form, clientId: client.id, clientName: client.name, useTmpClient: false })}
                  onFreeText={(clientName) => setForm({ ...form, clientId: '', clientName })} />
                {form.clientName.trim() && !form.clientId && !form.useTmpClient && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>ชื่อนี้จะเพิ่มเป็นลูกความใหม่เมื่อสร้างคดี · ประเภท</span>
                  <select aria-label="ประเภทลูกความใหม่" value={form.clientType} onChange={(event) => setForm({ ...form, clientType: event.target.value })} className="min-h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
                    <option value="INDIVIDUAL">บุคคลธรรมดา</option><option value="COMPANY">นิติบุคคล</option>
                  </select>
                </div>}
                {sameCustomer && <p className="mt-1 text-xs text-muted-foreground">ใช้ชื่อเดียวกับผู้ว่าจ้างรายแรก</p>}
              </div>
              <div>
                <label htmlFor="case-title" className={fieldLabel}>ชื่อคดี <span className="text-destructive">*</span></label>
                <input id="case-title" required value={form.title} onChange={(event) => { setAutoTitle(false); setForm({ ...form, title: event.target.value }); }} className={inputClass} placeholder="เช่น เรียกชำระหนี้ — บริษัท ตัวอย่าง" />
                {autoTitle && <p className="mt-1 text-xs text-muted-foreground">ตั้งชื่อจากประเภทคดีและลูกความให้อัตโนมัติ แก้ไขได้</p>}
              </div>
              <label htmlFor="lead-lawyer" className={fieldLabel}>ทนายผู้รับผิดชอบ <span className="text-destructive">*</span>
                <select id="lead-lawyer" required value={form.leadLawyerId} onChange={(event) => setForm({ ...form, leadLawyerId: event.target.value })} className={inputClass}>
                  <option value="">เลือกทนายผู้รับผิดชอบ</option>
                  {lawyers.map((lawyer) => <option key={lawyer.id} value={lawyer.id}>{lawyer.firstName} {lawyer.lastName}{workloadLabel(lawyer.id)}</option>)}
                </select>
              </label>
              <details className="rounded-lg border border-border p-3">
                <summary className="min-h-6 cursor-pointer text-sm font-medium">แนบเอกสาร / ช่วยกรอกด้วย AI (ไม่บังคับ){files.length > 0 && ` · ${files.length} ไฟล์`}</summary>
                <div className="mt-4 space-y-4">
              <BatchAnalysisPanel
                files={files}
                onFilesChange={(next) => { setFiles(next); setSuggestions([]); }}
                onFieldSuggestions={setSuggestions}
                onUseSummary={(summary) => setForm((current) => ({ ...current, description: [current.description.trim(), summary].filter(Boolean).join('\n\n') }))}
                onBusyChange={setAnalysisBusy}
                disabled={submitting}
              />
              <SuggestedFieldsPanel
                suggestions={suggestions}
                accepts={['title', 'opposingParty', 'courtName', 'incidentDate', 'claimedAmount', 'estimatedDamage']}
                current={{
                  title: form.title,
                  opposingParty: form.customFields.opposingParty,
                  courtName: form.courtName,
                  incidentDate: form.customFields.incidentDate,
                  claimedAmount: form.claimedAmount,
                  estimatedDamage: form.customFields.estimatedDamage,
                }}
                onApply={applySuggestion}
              />
                </div>
              </details>

              <details className="rounded-lg border border-border p-3">
                <summary className="min-h-6 cursor-pointer text-sm font-medium">ขั้นตอนงานอัตโนมัติ / Cargo Claim{(cargoClaimEnabled || playbookId) && ' · เลือกแล้ว'}</summary>
                <p className="mt-2 text-xs text-muted-foreground">เปิดคดีก่อน แล้วดูรายการงานจาก SOP เพื่อยืนยันเพิ่มงานในหน้าคดี</p>
              <label className="mt-4 block text-sm font-medium" htmlFor="new-case-playbook">
                มาตรฐานงานอัตโนมัติ <span className="font-normal text-muted-foreground">(เลือกได้)</span>
                <select
                  id="new-case-playbook"
                  className={inputClass}
                  value={cargoClaimEnabled ? CARGO_CLAIM_PLAYBOOK_KEY : playbookId}
                  onChange={(event) => {
                    playbookManuallySelected.current = true;
                    const selected = event.target.value;
                    const isCargoClaim = selected === CARGO_CLAIM_PLAYBOOK_KEY;
                    setCargoClaimEnabled(isCargoClaim);
                    setPlaybookId(isCargoClaim ? '' : selected);
                  }}
                >
                  <option value="">ไม่ใช้มาตรฐานอัตโนมัติ</option>
                  <option value={CARGO_CLAIM_PLAYBOOK_KEY}>{CARGO_CLAIM_PLAYBOOK_NAME} · รุ่นล่าสุด</option>
                  {playbooks.filter((playbook) => playbook.templateKey !== CARGO_CLAIM_PLAYBOOK_KEY).map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>
                      {playbook.name} · v{playbook.version}{playbook.caseTypeId === form.caseTypeId ? ' (แนะนำ)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              </details>

              <section className="space-y-3 border-t border-border pt-5" aria-label="ลูกความและผู้ว่าจ้าง">
                <details className="rounded-lg border border-border p-3">
                  <summary className="min-h-6 cursor-pointer text-sm font-medium">ผู้ว่าจ้าง / ผู้จ่ายเงิน (ถ้าต่างจากลูกความ){customers.some((row) => row.customerId) && ' · ระบุแล้ว'}</summary>
                <div className="mt-4 space-y-2">
                  {customers.map((row, index) => {
                    const contacts = clients.find((client) => client.id === row.customerId)?.contacts ?? [];
                    return (
                      <div key={index} className={"grid min-w-0 items-end gap-x-2 gap-y-2 " + (customers.length > 1 ? "grid-cols-[minmax(0,1fr)_5rem_auto]" : "grid-cols-1")}>
                        <CustomerSelect
                          id={"case-customer-" + index}
                          label={"ผู้ว่าจ้างรายที่ " + (index + 1)}
                          value={row.customerId}
                          clients={clients}
                          onChange={(customerId) => setCustomers((rows) => rows.map((item, i) => i === index ? { ...item, customerId, contactId: '' } : item))}
                          onCreated={(client) => setClients((rows) => [...rows, client].sort((a, b) => a.name.localeCompare(b.name, 'th')))}
                        />
                        {customers.length > 1 && (
                          <input
                            aria-label={"สัดส่วนผู้ว่าจ้างรายที่ " + (index + 1)}
                            type="number"
                            min="0"
                            max="100"
                            value={row.sharePercent}
                            onChange={(event) => setCustomers((rows) => rows.map((item, i) => i === index ? { ...item, sharePercent: event.target.value } : item))}
                            placeholder="%"
                            className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-center text-sm"
                          />
                        )}
                        {customers.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" aria-label={"ลบผู้ว่าจ้างรายที่ " + (index + 1)} onClick={() => setCustomers((rows) => rows.filter((_, i) => i !== index))} className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                        {row.customerId && (
                          <div className="col-span-full min-w-0 space-y-2">
                            {contacts.length > 0 ? (
                              <select
                                aria-label={"ผู้ติดต่อผู้ว่าจ้างรายที่ " + (index + 1)}
                                value={row.contactId ?? ''}
                                onChange={(event) => setCustomers((rows) => rows.map((item, i) => i === index ? { ...item, contactId: event.target.value } : item))}
                                className="min-h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                              >
                                <option value="">ยังไม่ระบุผู้ติดต่อ</option>
                                {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                              </select>
                            ) : (
                              <p className="text-xs text-muted-foreground">ยังไม่มีชื่อผู้ติดต่อ</p>
                            )}
                            <Button type="button" variant="outline" size="sm" onClick={() => setContactDialogCustomerIndex(index)}>
                              <Plus className="h-3.5 w-3.5" /> เพิ่มผู้ติดต่อ
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setCustomers((rows) => [...rows, { customerId: '', sharePercent: '', contactId: '' }])}>
                      <Plus className="h-3.5 w-3.5" /> เพิ่มผู้ว่าจ้าง
                    </Button>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={sameCustomer} onChange={(event) => setSameCustomer(event.target.checked)} />
                      ลูกความเป็นผู้ว่าจ้างรายแรก
                    </label>
                  </div>
                </div>
                </details>

              </section>

              <details className="rounded-lg border border-border p-3">
                <summary className="min-h-6 cursor-pointer text-sm font-medium">รายละเอียดคดีเพิ่มเติม (ไม่บังคับ)</summary>
              <div className="mt-4">
                <label className="mb-4 flex items-center gap-2 text-sm">
                  <Checkbox checked={form.useTmpClient} onChange={(event) => setForm({ ...form, useTmpClient: event.target.checked, clientId: event.target.checked ? '' : form.clientId })} />
                  ยังไม่ทราบชื่อลูกความ
                </label>
                <label htmlFor="case-number" className={fieldLabel}>เลขอ้างอิงสำนักงาน</label>
                <input
                  id="case-number"
                  value={form.ownRef}
                  onChange={(event) => setForm({ ...form, ownRef: event.target.value })}
                  className={inputClass}
                  placeholder={nextOwnRef || "เช่น TSBREF20260001"}
                />
                {nextOwnRef && !form.ownRef && (
                  <p className="mt-1 text-xs text-muted-foreground">ใช้เลขที่แนะนำ: {nextOwnRef}</p>
                )}
              </div>
              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <label className={fieldLabel}>คู่กรณี
                  <input value={form.customFields.opposingParty ?? ''} onChange={(event) => setForm((current) => ({ ...current, customFields: { ...current.customFields, opposingParty: event.target.value } }))} className={inputClass} />
                </label>
                <label className={fieldLabel}>ศาล
                  <input value={form.courtName} onChange={(event) => setForm((current) => ({ ...current, courtName: event.target.value }))} className={inputClass} />
                </label>
                <label className={fieldLabel}>วันเกิดเหตุ
                  <input type="date" value={form.customFields.incidentDate?.slice(0, 10) ?? ''} onChange={(event) => setForm((current) => ({ ...current, customFields: { ...current.customFields, incidentDate: event.target.value } }))} className={inputClass} />
                </label>
                <label className={fieldLabel}>ทุนทรัพย์ที่เรียกร้อง (บาท)
                  <MoneyInput min={0} max={FEE_MAX} value={form.claimedAmount} onValueChange={(next) => setForm((current) => ({ ...current, claimedAmount: next }))} className={inputClass} />
                </label>
                <label className={fieldLabel}>ความเสียหายโดยประมาณ (บาท)
                  <MoneyInput min={0} max={FEE_MAX} value={form.customFields.estimatedDamage ?? ''} onValueChange={(next) => setForm((current) => ({ ...current, customFields: { ...current.customFields, estimatedDamage: next } }))} className={inputClass} />
                </label>
                <label className="text-sm font-medium sm:col-span-2">รายละเอียดและข้อเท็จจริงคดี
                  <textarea rows={4} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={inputClass} />
                </label>
              </div>
              </details>

              {fieldSchema.some((field) => field.key === 'chargeSection' && field.required) && (
                <label className="block text-sm font-medium">
                  ข้อหาหรือฐานความผิด *
                  <textarea required rows={2} maxLength={2000} value={form.chargeSection} onChange={(event) => setForm({ ...form, chargeSection: event.target.value })} className={inputClass} />
                </label>
              )}
              {fieldSchema.some((field) => field.required && field.key !== 'chargeSection') && (
                <section className="space-y-3 border-t border-border pt-5" aria-label="ข้อมูลที่ประเภทคดีกำหนด">
                  <h3 className="text-sm font-semibold">ข้อมูลที่ต้องใช้กับประเภทคดีนี้</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {fieldSchema.filter((field) => field.required && field.key !== 'chargeSection').map((field) => (
                      <label key={field.key} htmlFor={"custom-" + field.key} className="block text-sm font-medium">
                        {field.label} *
                        {field.type === 'select' ? (
                          <select id={"custom-" + field.key} required value={form.customFields[field.key] ?? ''} onChange={(event) => setForm({ ...form, customFields: { ...form.customFields, [field.key]: event.target.value } })} className={inputClass}>
                            <option value="">เลือก{field.label}</option>
                            {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input id={"custom-" + field.key} type={field.type} step={field.type === 'number' ? 'any' : undefined} required value={form.customFields[field.key] ?? ''} onChange={(event) => setForm({ ...form, customFields: { ...form.customFields, [field.key]: event.target.value } })} className={inputClass} />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              )}
            </div>
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card py-3 pl-4 pr-20 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-nowrap active:bg-accent/80"
            disabled={submitting}
            onClick={() => router.push(createdCaseId.current ? `/cases/${createdCaseId.current}?tab=documents` : '/cases')}
          >
            {createdCaseId.current ? 'ไปยังคดี' : 'ยกเลิก'}
          </Button>
          <Button
            type="submit"
            className="min-h-11 whitespace-nowrap px-5 active:bg-primary/80"
            disabled={
              submitting ||
              analysisBusy ||
              loadingTypes ||
              !caseTypes.length
            }
          >
            {submitting
              ? 'กำลังบันทึก…'
              : uploadFailures.length
                ? `ลองอัปโหลดอีกครั้ง (${uploadFailures.length} ไฟล์)`
              : 'สร้างคดี'}
          </Button>
            </div>
          </form>
          {contactDialogCustomerIndex != null && (() => {
            const row = customers[contactDialogCustomerIndex];
            const client = clients.find((item) => item.id === row?.customerId);
            if (!client) return null;
            return (
              <CreateClientContactDialog
                client={client}
                onClose={() => setContactDialogCustomerIndex(null)}
                onCreated={(updatedClient, contactId) => {
                  setClients((items) => items.map((item) => item.id === updatedClient.id ? updatedClient : item));
                  setCustomers((rows) => rows.map((item, index) => index === contactDialogCustomerIndex ? { ...item, contactId } : item));
                  setContactDialogCustomerIndex(null);
                }}
              />
            );
          })()}
        </div>

      </div>
    </div>
  );
}
