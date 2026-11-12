'use client';

// Hallmark · genre: modern-minimal · fingerprint: hanging / single-column / hairline / solid-primary / no-imagery / no-reveal · tone: soft · anchor: Samnuan blue
// Hallmark · contrast: pass (40–41) · responsive: pass (34, 49–57) · pre-emit: P5 H5 E4 S5 R5 V5

import { ThaiDateField } from '@/components/ui/ThaiDateField';
import { ClientCombobox } from './ClientCombobox';
import { missingFields } from './validation';
import { latestPlaybookReleases, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';
import { CreateClientContactDialog } from '@/components/intake/CreateClientContactDialog';
import { OwnerPicker } from '@/components/cases/new-case/OwnerPicker';
import { EmailLinkCandidates } from '@/components/cases/EmailLinkCandidates';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  api,
  CaseTypeItem,
  CourtItem,
  ClientItem,
  ApiError,
  FieldSuggestion,
  SuggestibleField,
  type LinkCandidate,
  type UserItem,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageLoading } from '@/components/ui/misc';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { CourtSelect } from '@/components/cases/CourtSelect';
import { ConflictOverrideDialog } from '@/components/ConflictOverrideDialog';
import { conflictMatchesFrom, type ConflictMatchItem } from '@/lib/conflict';
import { litigationPayload, openingStageError, type OpponentRow } from '@/lib/case-create';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { Checkbox } from '@/components/ui/checkbox';
import styles from '@/components/case-page/v2.module.css';
import { ArrowLeft, Building2, Check, ChevronDown, ClipboardList, Loader2, Paperclip, Plus, Scale, Settings2, Wallet, X } from 'lucide-react';
import type { CaseFieldSchema } from '@lawfirm/shared';
import {
  TMP_CLIENT_PLACEHOLDER,
  CourtLevel,
  COURT_LEVEL_LABELS,
  PARTY_ROLE_LABELS,
  PartyRole,
  CASE_NUMBER_HINT,
  CASE_NUMBER_HTML,
  FEE_MAX,
  CARGO_CLAIM_PLAYBOOK_KEY,
  CARGO_CLAIM_PLAYBOOK_NAME,
  CASE_STAGE_LABELS_TH, CaseStage,
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
  const emailFailures = useRef(0);
  const playbookManuallySelected = useRef(Boolean(requestedSopId));
  const [autoTitle, setAutoTitle] = useState(true);
  const [retry, setRetry] = useState(0);
  const [lookupWarning, setLookupWarning] = useState('');
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [playbookId, setPlaybookId] = useState(requestedSopId);
  const [cargoClaimEnabled, setCargoClaimEnabled] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([{ name: '', role: '', personType: '' }]);
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  useEffect(() => { if (token) api.getLawyers(token).then(setLawyers).catch(() => setLawyers([])); }, [token]);
  const [limitationIncomplete, setLimitationIncomplete] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<LinkCandidate[]>([]);
  const [blackUnknown, setBlackUnknown] = useState(false);
  const [editingRef, setEditingRef] = useState(false);
  const [stage, setStage] = useState<CaseStage>(CaseStage.PRE_LITIGATION);
  const [conflict, setConflict] = useState<ConflictMatchItem[] | null>(null);

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
    partyRole: '',
    courtLevel: CourtLevel.TRIAL as string,
    blackCaseNumber: '',
    redCaseNumber: '',
    limitationDeadline: '',
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

  // chargeSection and the keys with their own input elsewhere on the form are not repeated here.
  const customFieldList = fieldSchema.filter((field) => !['chargeSection', 'incidentDate', 'estimatedDamage', 'opposingParty'].includes(field.key));

  const stages = [CaseStage.PRE_LITIGATION, CaseStage.FILING, CaseStage.ANSWER, CaseStage.MEDIATION, CaseStage.HEARING, CaseStage.AWAITING_JUDGMENT, CaseStage.ENFORCEMENT];
  const stageIndex = stages.indexOf(stage);
  useEffect(() => { setSelectedEmails([]); }, [form.clientId]);

  useEffect(() => {
    if (!token) return;
    setLoadingTypes(true);
    setError('');
    setLookupWarning('');
    Promise.all([
      api.getCaseTypes(token),
      api.getClients(token).catch(() => {
        setLookupWarning(
          'โหลดรายชื่อลูกความไม่สำเร็จ ลองโหลดใหม่ก่อนกรอกต่อ',
        );
        return [] as ClientItem[];
      }),
      api.getNextOwnRef(token).catch(() => ({ ownRef: '' })),
      api.getCourts(token).catch(() => [] as CourtItem[]),
    ])
      .then(
        ([types, clientList, nextRef, courtList]) => {
          setForm((f) => ({
            ...f,
            leadLawyerId: f.leadLawyerId || user?.id || '',
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
              setLookupWarning('ไม่พบลูกความที่เลือก กรุณาโหลดใหม่หรือเลือกลูกความอีกครั้งก่อนเปิดคดี');
            }
          }
          setNextOwnRef(nextRef.ownRef);
          setCourts(courtList);
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
    if (limitationIncomplete) return 'กรอกวันครบอายุความให้ครบ (วัน/เดือน/ปี พ.ศ.) หรือเว้นว่างทั้งหมด';
    if (!form.leadLawyerId) return 'กรุณาเลือกทนายผู้รับผิดชอบ';
    const stageError = openingStageError(stage, form.courtName, form.blackCaseNumber, blackUnknown);
    if (stageError) return stageError;
    return '';
  };
  const missing = missingFields({ ...form, inCourt: stageIndex > 0, blackUnknown });
  const completed = 4 - [!!form.caseTypeId, !!form.title.trim(), !!form.leadLawyerId, !openingStageError(stage, form.courtName, form.blackCaseNumber, blackUnknown)].filter((done) => !done).length;
  useEffect(() => {
    for (const id of ['lead-lawyer', 'court-name']) {
      const element = document.getElementById(id);
      const invalid = showValidation && missing.some((item) => item.id === id);
      element?.setAttribute('aria-invalid', String(invalid));
      if (invalid) element?.setAttribute('aria-describedby', `${id}-error`);
      else element?.removeAttribute('aria-describedby');
      element?.classList.toggle(styles.invalid, invalid);
    }
  });
  const handleSubmit = async (conflictOverrideReason?: string) => {
    if (!token || submittingRef.current) return;
    if (!createdCaseId.current) {
      if (requestedClientId && !clientContextApplied.current && !form.clientId && !form.clientName.trim() && !form.useTmpClient) {
        setError('ไม่พบลูกความที่เลือก กรุณาเลือกลูกความหรือพิมพ์ชื่อใหม่ก่อนเปิดคดี');
        return;
      }
      if (missing.length) {
        setShowValidation(true);
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
      const message = validationMessage();
      if (message) {
        setError(message);
        return;
      }
    }
    if (analysisBusy) { setError('รอวิเคราะห์เอกสารให้เสร็จก่อนเปิดคดี'); return; }
    if (formRef.current) {
      // The browser can't point at an invalid field inside a closed section, so open those sections first.
      for (const field of Array.from(formRef.current.querySelectorAll<HTMLElement>('input:invalid, select:invalid, textarea:invalid'))) {
        for (let section = field.closest('details'); section; section = section.parentElement?.closest('details') ?? null) section.open = true;
      }
      if (!formRef.current.reportValidity()) return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      if (!createdCaseId.current) {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        stage,
        ...(stageIndex > 0 && blackUnknown ? { blackCaseNumberUnknown: true } : {}),
        ...(form.redCaseNumber.trim() ? { redCaseNumber: form.redCaseNumber.trim() } : {}),
        ownRef: form.ownRef.trim() || undefined,
        ownRefSuggested: nextOwnRef || undefined,
        description: form.description.trim() || undefined,
        claimedAmount: form.claimedAmount ? Number(form.claimedAmount) : undefined,
        ...litigationPayload({
          partyRole: form.partyRole,
          opponents,
          courtLevel: form.courtLevel,
          courtName: form.courtName,
          blackCaseNumber: stageIndex > 0 && blackUnknown ? '' : form.blackCaseNumber,
          limitationDeadline: form.limitationDeadline,
        }),
        ...(conflictOverrideReason ? { conflictOverrideReason } : {}),
        leadLawyerId: form.leadLawyerId,
        ...(teamIds.filter((id) => id !== form.leadLawyerId).length ? { buddyIds: teamIds.filter((id) => id !== form.leadLawyerId) } : {}),
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
        // A retry after the conflict prompt reuses this client instead of creating it again.
        setClients((rows) => [...rows, createdClient]);
        setForm((current) => ({ ...current, clientId: createdClient.id, clientName: createdClient.name }));
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
      setConflict(null);
      pendingUploads.current = files;
      for (const row of selectedEmails) {
        try { await api.linkThreadToCase(token, row.threadId, created.id); } catch { emailFailures.current++; }
      }
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
        setError(`สร้างคดีแล้ว แต่อัปโหลดเอกสารไม่สำเร็จ: ${failed.map((file) => file.name).join(', ')} — กดลองอีกครั้งได้โดยไม่สร้างคดีซ้ำ${emailFailures.current ? ` · ผูกอีเมลไม่สำเร็จ ${emailFailures.current} ฉบับ — ผูกได้อีกครั้งจากแท็บอีเมลของคดี` : ''}`);
        setSubmitting(false);
        submittingRef.current = false;
        return;
      }
      if (emailFailures.current) {
        router.push(`/cases/${createdCaseId.current}?tab=email&emailLinkFailures=${emailFailures.current}`);
        return;
      }
      router.push(`/cases/${createdCaseId.current}/opened${playbookId ? `?sop=${encodeURIComponent(playbookId)}` : ''}`);
    } catch (err) {
      const matches = conflictMatchesFrom(err);
      setConflict(matches);
      if (matches) {
        submittingRef.current = false;
        setSubmitting(false);
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : createdCaseId.current
            ? 'สร้างคดีแล้ว แต่ขั้นตอนหลังสร้างคดียังไม่เสร็จ กดลองใหม่ได้โดยไม่สร้างคดีซ้ำ'
            : 'สร้างคดีไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองใหม่',
      );
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const applySuggestion = (field: SuggestibleField, value: string) => {
    if (field === 'opposingParty') {
      const name = value.trim().slice(0, 200);
      setOpponents((rows) => {
        const filled = rows.filter((row) => row.name.trim());
        return !name || filled.some((row) => row.name.trim() === name) || filled.length >= 20
          ? rows
          : [...filled, { name, role: '', personType: '' }];
      });
      return;
    }
    if (field === 'title') setAutoTitle(false);
    setForm((current) => {
      if (field === 'title' || field === 'courtName' || field === 'claimedAmount')
        return { ...current, [field]: value };
      return { ...current, customFields: { ...current.customFields, [field]: field === 'incidentDate' ? value.slice(0, 10) : value } };
    });
  };

  const inputClass =
    `${styles.field} min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60`;
  const fieldLabel = `block ${styles.flabel}`;

  if (submitting) return <section className="mx-auto max-w-6xl px-8 py-8" aria-live="polite"><h1 className="font-display text-[34px]">เปิดคดีใหม่</h1><div className={`${styles.card} mt-6 p-7 opacity-60`}><p className={styles.label}>ข้อมูลที่ต้องมี (ล็อกไว้ระหว่างบันทึก)</p><div className="mt-4 grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className={styles.field} />)}</div></div><div className="mt-6 flex items-center justify-between rounded-xl border bg-[#fffdfa] px-6 py-4"><div><b>กำลังเปิดคดี…</b><p className={styles.hint}>สร้างแฟ้มคดี · ตรวจผลประโยชน์ขัดกัน · แจ้งทีม — อย่าปิดหน้านี้</p></div><button disabled className={`${styles.btn} ${styles.primary} px-8 opacity-80`}><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> กำลังบันทึก</button></div></section>;

  return (
    <div
      data-hallmark="case-create-flow"
      className="mx-auto w-full max-w-6xl min-w-0 px-8 py-8 [overflow-wrap:anywhere]"
    >
      <Link
        href="/cases"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        เรื่องและคดี
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-[34px]">เปิดคดีใหม่</h1><p className="text-muted-foreground">กรอกแค่ช่องที่มีดอกจัน (*) ก็เปิดคดีได้ ข้อมูลอื่นเพิ่มทีหลังได้</p></div>
        <div className="rounded-xl bg-[#eeebe3] px-5 py-3"><span className={styles.label}>เลขอ้างอิงสำนักงาน</span><div className="flex items-center gap-3">{editingRef ? <input disabled={submitting} aria-label="เลขอ้างอิงสำนักงาน" value={form.ownRef} onChange={(event) => setForm({ ...form, ownRef: event.target.value })} className={inputClass} /> : <span className="text-2xl font-bold">{form.ownRef || 'กำลังออกเลขอ้างอิง'}</span>}<button type="button" disabled={submitting} className="min-h-11 text-sm underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setEditingRef(!editingRef)}>{editingRef ? 'เสร็จ' : 'แก้ไข'}</button></div><p className={styles.hint}>ระบบออกเลขให้อัตโนมัติ</p></div>
      </div>

      <div className="min-w-0">
        <div className="min-w-0">
          <form ref={formRef} noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
            onInvalidCapture={(event) => {
              const details = (event.target as HTMLElement).closest('details');
              if (details) details.open = true;
            }}
            className="mt-6 min-w-0 space-y-6 text-card-foreground"
          >
            {showValidation && missing.length > 0 && <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-xl border-2 border-[#e9b9b9] bg-[#fbeaea] px-5 py-4 focus:outline-none"><p className="font-bold text-[#a83232]">ยังเปิดคดีไม่ได้ ต้องกรอกอีก {missing.length} ช่อง</p><p className="mt-1 text-sm">ไปที่ช่อง: {missing.map((item, index) => <span key={item.id}>{index > 0 && ' · '}<a href={`#${item.id}`} className="underline" onClick={(event) => { event.preventDefault(); document.getElementById(item.id)?.focus(); }}>{item.label}</a></span>)}</p></div>}
            <fieldset
              disabled={submitting || !!createdCaseId.current}
              className="min-w-0 space-y-3"
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

            <div className={`${styles.card} p-7 shadow-[0_6px_20px_rgba(20,46,67,.06)]`}><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">ข้อมูลที่ต้องมี</h2><p className={styles.hint}>4 ช่องนี้พอสำหรับเปิดคดี</p></div>{!missing.length && <span className="rounded-full bg-[#e6f3ec] px-3 py-1 text-sm font-semibold text-[#227052]"><Check aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> ครบแล้ว</span>}</div><div className="mt-5 grid min-w-0 gap-x-8 gap-y-6 md:grid-cols-2">
              <label htmlFor="case-type" className={fieldLabel}>ประเภทคดี <span className="text-destructive">*</span>
                <select id="case-type" aria-invalid={showValidation && !form.caseTypeId} aria-describedby={showValidation && !form.caseTypeId ? "case-type-error" : undefined} disabled={loadingTypes} value={form.caseTypeId} className={`${inputClass} ${showValidation && !form.caseTypeId ? styles.invalid : ''}`}
                  onChange={(event) => setForm((current) => current.caseTypeId === event.target.value ? current : {
                    ...current, caseTypeId: event.target.value, chargeSection: '',
                    customFields: {
                      incidentDate: current.customFields.incidentDate ?? '',
                      estimatedDamage: current.customFields.estimatedDamage ?? '',
                    },
                  })}>
                  <option value="">{loadingTypes ? 'กำลังโหลดประเภทคดี…' : 'เลือกประเภทคดี'}</option>
                  {caseTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
                {showValidation && !form.caseTypeId && <span id="case-type-error" className={`block ${styles.error}`}>ยังไม่ได้เลือกประเภทคดี</span>}<span className={`block font-normal ${styles.hint}`}>ประเภทคดีกำหนดขั้นตอนงานและข้อมูลที่ต้องกรอก</span>
              </label>
              <div>
                <label htmlFor="case-title" className={fieldLabel}>ชื่อคดี <span className="text-destructive">*</span></label>
                <input id="case-title" aria-invalid={showValidation && !form.title.trim()} aria-describedby={showValidation && !form.title.trim() ? "case-title-error" : undefined} value={form.title} onChange={(event) => { setAutoTitle(false); setForm({ ...form, title: event.target.value }); }} className={`${inputClass} ${showValidation && !form.title.trim() ? styles.invalid : ''}`} placeholder="เช่น เรียกชำระหนี้ — บริษัท ตัวอย่าง" />
                {showValidation && !form.title.trim() && <p id="case-title-error" className={styles.error}>ยังไม่มีชื่อคดี</p>}<p className={styles.hint}>เลือกประเภทคดีและลูกความ แล้วระบบจะตั้งชื่อให้ (แก้ได้)</p>
              </div>
              <div>
                <label htmlFor="client-combobox" className={fieldLabel}>ลูกความ <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span></label>
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
                <p className={styles.hint}>ถ้าไม่พบในรายชื่อ ระบบจะเพิ่มเป็นลูกความใหม่ให้</p>
                {sameCustomer && <p className="mt-1 text-xs text-muted-foreground">ใช้ชื่อเดียวกับผู้ว่าจ้างรายแรก</p>}
              </div>
              <div><label htmlFor="lead-lawyer" className={fieldLabel}>ทนายผู้รับผิดชอบ <span className="text-destructive">*</span></label>
                {token && <OwnerPicker id="lead-lawyer" token={token} currentUserId={user?.id} value={form.leadLawyerId} onChange={(leadLawyerId) => setForm((current) => ({ ...current, leadLawyerId }))}  />}
                {showValidation && !form.leadLawyerId && <p id="lead-lawyer-error" className={styles.error}>ยังไม่ได้เลือกทนายผู้รับผิดชอบ</p>}<p className={styles.hint}>ผู้ดูแลหลักของคดี 1 คน ได้รับแจ้งเตือนทุกเรื่อง</p>
              </div>
              <div><span className={fieldLabel}>ทีมคดี <span className="font-normal text-muted-foreground">(ไม่บังคับ · เลือกได้หลายคน)</span></span>
                <details className="relative"><summary className={`${styles.field} flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring`}>{teamIds.filter((id) => id !== form.leadLawyerId).map((id) => { const person = lawyers.find((lawyer) => lawyer.id === id); return person ? <span key={id} className={styles.chip}>{person.firstName} {person.lastName}</span> : null; })}{teamIds.length > 0 ? <><Plus aria-hidden="true" className="h-[1.1em] w-[1.1em]" /> เพิ่ม</> : 'เลือกคนที่ช่วยทำคดีนี้'}</summary><div className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#c9ccc6] bg-white p-1 shadow-lg">{lawyers.filter((lawyer) => lawyer.id !== form.leadLawyerId).map((lawyer) => <label key={lawyer.id} className="flex min-h-11 items-center gap-2 px-3 hover:bg-[#eeebe3]"><input type="checkbox" checked={teamIds.includes(lawyer.id)} onChange={() => setTeamIds((ids) => ids.includes(lawyer.id) ? ids.filter((id) => id !== lawyer.id) : [...ids, lawyer.id])} />{lawyer.firstName} {lawyer.lastName}</label>)}</div></details>
                <p className={styles.hint}>คนในทีมเห็นคดีนี้ ติ๊กงานได้ และได้รับแจ้งเตือน</p>
              </div>
              <fieldset><legend className={fieldLabel}>คดีนี้ฟ้องแล้วหรือยัง *</legend><div className="mt-1 grid grid-cols-2 gap-2">{[{ label: 'ยังไม่ฟ้อง', value: false }, { label: 'อยู่ในศาลแล้ว', value: true }].map((option) => <label key={option.label} className={`${styles.btn} ${styles.opt} ${(stageIndex > 0) === option.value ? styles.on : ''} cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}><input type="radio" name="court-status" className="sr-only" checked={(stageIndex > 0) === option.value} onChange={() => setStage(option.value ? CaseStage.FILING : CaseStage.PRE_LITIGATION)} />{(stageIndex > 0) === option.value && <Check aria-hidden="true" className="h-[1.1em] w-[1.1em]" />}{option.label}</label>)}</div>{stageIndex === 0 && <p className={styles.hint}>ถ้าอยู่ในศาลแล้ว จะถามชื่อศาลกับหมายเลขคดีดำเพิ่ม</p>}</fieldset>
              {stageIndex > 0 && <>
                <label htmlFor="court-stage" className={fieldLabel}>ตอนนี้อยู่ขั้นไหนในศาล *<select id="court-stage" value={stage} onChange={(event) => setStage(event.target.value as CaseStage)} className={inputClass}>{stages.slice(1).map((item) => <option key={item} value={item}>{CASE_STAGE_LABELS_TH[item]}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-4">
                  <label htmlFor="court-name" className={fieldLabel}>ศาล{stageIndex > 0 ? ' *' : ''}
                    <CourtSelect id="court-name" value={form.courtName} courts={courts} onChange={(courtName) => setForm((current) => ({ ...current, courtName }))} className={inputClass} />
                    {showValidation && !form.courtName.trim() && <span id="court-name-error" className="block text-sm text-destructive">ยังไม่ได้เลือกชื่อศาล</span>}<span className="sr-only">ใช้ระบุศาลที่รับคดี</span>
                  </label>
                  <label htmlFor="black-case-number" className={fieldLabel}>หมายเลขคดีดำ{stageIndex > 0 && !blackUnknown ? ' *' : ''}
                    <input id="black-case-number" aria-invalid={showValidation && !blackUnknown && !form.blackCaseNumber.trim()} aria-describedby={showValidation && !blackUnknown && !form.blackCaseNumber.trim() ? "black-case-number-error" : undefined} disabled={stageIndex > 0 && blackUnknown} value={form.blackCaseNumber} onChange={(e) => setForm({ ...form, blackCaseNumber: e.target.value })}
                      placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} className={`${inputClass} ${showValidation && !blackUnknown && !form.blackCaseNumber.trim() ? styles.invalid : ''}`} />
                    {showValidation && !blackUnknown && !form.blackCaseNumber.trim() && <span id="black-case-number-error" className="block text-sm text-destructive">ยังไม่ได้กรอกหมายเลขคดีดำ</span>}<span className="sr-only">ใช้ค้นหาและอ้างอิงคดีในศาล</span>
                  </label>
                  <label htmlFor="court-level" className={fieldLabel}>ระดับศาล<select id="court-level" value={form.courtLevel} onChange={(e) => setForm({ ...form, courtLevel: e.target.value })} className={inputClass}>{Object.values(CourtLevel).map((level) => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}</select></label>
                  {stageIndex > 0 && <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={blackUnknown} onChange={(e) => setBlackUnknown(e.target.checked)} />ยังไม่ทราบเลขคดี — สร้างงาน "ใส่หมายเลขคดีดำ" ให้ทนายผู้รับผิดชอบ</label>}
                </div>
              </>}
            </div></div>
<div className="pt-3"><h2 className="text-xl font-bold">ข้อมูลเพิ่มเติม <span className={styles.label}>(ไม่บังคับ — กรอกตอนนี้หรือหลังเปิดคดีก็ได้)</span></h2></div>
<details className={`${styles.card} group p-6`}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-lg font-bold"><Scale aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> คู่ความและฝ่ายเรา</span><span className={`block ${styles.hint}`}>ใครฟ้องใคร — ใช้ในคำฟ้องและตรวจผลประโยชน์ขัดกัน</span></span><span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">{(() => { const n = Number(!!form.partyRole) + Number(opponents.some((row) => !!row.name.trim())); return n ? `กรอกแล้ว ${n}/2` : 'ยังไม่กรอก'; })()} · <ChevronDown aria-hidden="true" className="inline h-[1.1em] w-[1.1em] group-open:rotate-180" /> <span className="group-open:hidden">เปิด</span><span className="hidden group-open:inline">ปิด</span></span></summary><div className="mt-4 space-y-4">                {stageIndex === 0 && <div className="grid gap-4 sm:grid-cols-2"><label htmlFor="court-level-pre" className={fieldLabel}>ระดับศาล<select id="court-level-pre" value={form.courtLevel} onChange={(e) => setForm({ ...form, courtLevel: e.target.value })} className={inputClass}>{Object.values(CourtLevel).map((level) => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}</select></label><label htmlFor="court-name-pre" className={fieldLabel}>ศาล<CourtSelect id="court-name-pre" value={form.courtName} courts={courts} onChange={(courtName) => setForm((current) => ({ ...current, courtName }))} className={inputClass} /></label><label htmlFor="black-case-number-pre" className={fieldLabel}>หมายเลขคดีดำ<input id="black-case-number-pre" value={form.blackCaseNumber} onChange={(e) => setForm({ ...form, blackCaseNumber: e.target.value })} placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} className={inputClass} /></label></div>}
                <fieldset><legend className={fieldLabel}>เราเป็นทนายให้ฝ่ายไหน</legend><div className="mt-2 flex flex-wrap gap-2">{['', ...Object.values(PartyRole)].map((role) => <label key={role} className={`${styles.btn} ${styles.opt} ${form.partyRole === role ? styles.on : ''} cursor-pointer whitespace-nowrap has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring`}><input type="radio" name="party-role" className="sr-only" checked={form.partyRole === role} onChange={() => setForm({ ...form, partyRole: role })} />{form.partyRole === role && <Check aria-hidden="true" className="mr-2 h-4 w-4" />}{role ? PARTY_ROLE_LABELS[role as PartyRole] : 'ยังไม่ระบุ'}</label>)}</div></fieldset>
                <fieldset className="min-w-0 space-y-2">
                  <legend className={fieldLabel}>คู่ความฝ่ายตรงข้าม</legend>
                  {opponents.map((row, index) => (
                    <div key={index} className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto]">
                      <input aria-label={`ชื่อคู่ความฝ่ายตรงข้ามรายที่ ${index + 1}`} value={row.name} placeholder="ชื่อบุคคลหรือบริษัท" maxLength={200}
                        onChange={(e) => setOpponents((rows) => rows.map((r, i) => i === index ? { ...r, name: e.target.value } : r))} className={inputClass} />
                      <select aria-label={`ฐานะคู่ความรายที่ ${index + 1}`} value={row.role}
                        onChange={(e) => setOpponents((rows) => rows.map((r, i) => i === index ? { ...r, role: e.target.value } : r))} className={inputClass}>
                        <option value="">ตรงข้ามกับฝ่ายเรา (ค่าเริ่มต้น)</option>
                        <option value="PLAINTIFF">โจทก์</option><option value="DEFENDANT">จำเลย</option>
                        <option value="PETITIONER">ผู้ร้อง</option><option value="RESPONDENT">ผู้คัดค้าน</option>
                        <option value="OPPOSING_LAWYER">ทนายฝ่ายตรงข้าม</option><option value="OPPOSING_INSURER">บริษัทประกันฝ่ายตรงข้าม</option>
                        <option value="OTHER">อื่น ๆ</option>
                      </select>
                      <select aria-label={`ประเภทบุคคลรายที่ ${index + 1}`} value={row.personType}
                        onChange={(e) => setOpponents((rows) => rows.map((r, i) => i === index ? { ...r, personType: e.target.value } : r))} className={inputClass}>
                        <option value="">ประเภท</option><option value="บุคคลธรรมดา">บุคคลธรรมดา</option><option value="นิติบุคคล">นิติบุคคล</option>
                      </select>
                      <Button type="button" variant="ghost" size="icon" aria-label={`ลบคู่ความรายที่ ${index + 1}`} disabled={opponents.length === 1}
                        onClick={() => setOpponents((rows) => rows.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" disabled={opponents.length >= 20} onClick={() => setOpponents((rows) => [...rows, { name: '', role: '', personType: '' }])}>
                    <Plus className="h-3.5 w-3.5" /> เพิ่มคู่ความ
                  </Button>
                </fieldset>
</div></details>
{/* Required for this case type, so it stays visible — a required field inside a closed section blocks submit silently. */}
{fieldSchema.some((field) => field.key === 'chargeSection') && (
  <div className={`${styles.card} p-6`}>
    <label className="block text-sm font-medium">
      ข้อหาหรือฐานความผิด *
      <textarea required rows={2} maxLength={2000} value={form.chargeSection} onChange={(event) => setForm({ ...form, chargeSection: event.target.value })} className={inputClass} />
    </label>
  </div>
)}
<details className={`${styles.card} group p-6`}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-lg font-bold"><Wallet aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> ทุนทรัพย์ ข้อหา และอายุความ</span><span className={`block ${styles.hint}`}>ใช้คำนวณค่าขึ้นศาล และให้ระบบเตือนก่อนขาดอายุความ</span></span><span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">{(() => { const n = [form.redCaseNumber, form.limitationDeadline, form.claimedAmount, form.chargeSection, form.description, form.customFields.incidentDate, form.customFields.estimatedDamage].filter(Boolean).length; return n ? `กรอกแล้ว ${n}/7` : 'ยังไม่กรอก'; })()} · <ChevronDown aria-hidden="true" className="inline h-[1.1em] w-[1.1em] group-open:rotate-180" /> <span className="group-open:hidden">เปิด</span><span className="hidden group-open:inline">ปิด</span></span></summary><div className="mt-4 space-y-4"><div className="grid gap-4 sm:grid-cols-2">
                  <label htmlFor="red-case-number" className={fieldLabel}>หมายเลขคดีแดง (ไม่บังคับ)<input id="red-case-number" value={form.redCaseNumber} onChange={(e) => setForm({ ...form, redCaseNumber: e.target.value })} placeholder={CASE_NUMBER_HINT} pattern={CASE_NUMBER_HTML} title={CASE_NUMBER_HINT} className={inputClass} /></label>
                  <div role="group" aria-labelledby="limitation-deadline-label" className={fieldLabel}>
                    <span id="limitation-deadline-label">วันครบอายุความ</span>
                    <ThaiDateField id="limitation-deadline" ariaLabel="วันครบอายุความ" value={form.limitationDeadline ?? ''} onChange={(limitationDeadline) => setForm((current) => ({ ...current, limitationDeadline }))} />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">ระบบเตือนก่อนครบ 90 / 30 / 7 / 1 วัน</span>
                  </div>

</div>
              <details className="rounded-lg border border-border p-3">
                <summary className="min-h-6 cursor-pointer text-sm font-medium">รายละเอียดคดีเพิ่มเติม (ไม่บังคับ)</summary>
              <div className="mt-4">
                <label className="mb-4 flex items-center gap-2 text-sm">
                  <Checkbox checked={form.useTmpClient} onChange={(event) => setForm({ ...form, useTmpClient: event.target.checked, clientId: event.target.checked ? '' : form.clientId })} />
                  ยังไม่ทราบชื่อลูกความ
                </label>
              </div>
              <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                <label className={fieldLabel}>วันเกิดเหตุ
                  <ThaiDateField ariaLabel="วันเกิดเหตุ" value={form.customFields.incidentDate?.slice(0, 10) ?? ''} onChange={(incidentDate) => setForm((current) => ({ ...current, customFields: { ...current.customFields, incidentDate } }))} />
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


</div></details>
{fieldSchema.length > 0 && <details className={`${styles.card} group p-6`}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-lg font-bold"><ClipboardList aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> ข้อมูลเฉพาะ{selectedType?.name}</span><span className={`block ${styles.hint}`}>ช่องที่ประเภทคดีนี้ใช้ — กรอกตอนนี้หรือหลังเปิดคดีก็ได้</span></span><span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">{(() => { const n = customFieldList.filter((field) => !!form.customFields[field.key]).length; return n ? `กรอกแล้ว ${n}/${customFieldList.length}` : 'ยังไม่กรอก'; })()} · <ChevronDown aria-hidden="true" className="inline h-[1.1em] w-[1.1em] group-open:rotate-180" /> <span className="group-open:hidden">เปิด</span><span className="hidden group-open:inline">ปิด</span></span></summary>              {customFieldList.length > 0 && (
                <section className="space-y-3 border-t border-border pt-5" aria-label="ข้อมูลของประเภทคดี">
                  <h3 className="text-sm font-semibold">ข้อมูลของประเภทคดีนี้</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {customFieldList.map((field) => (
                      <label key={field.key} htmlFor={"custom-" + field.key} className="block text-sm font-medium">
                        {field.label}
                        {field.type === 'select' ? (
                          <select id={"custom-" + field.key} value={form.customFields[field.key] ?? ''} onChange={(event) => setForm({ ...form, customFields: { ...form.customFields, [field.key]: event.target.value } })} className={inputClass}>
                            <option value="">เลือก{field.label}</option>
                            {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input id={"custom-" + field.key} type={field.type} step={field.type === 'number' ? 'any' : undefined} value={form.customFields[field.key] ?? ''} onChange={(event) => setForm({ ...form, customFields: { ...form.customFields, [field.key]: event.target.value } })} className={inputClass} />
                        )}
                      </label>
                    ))}
                  </div>
                </section>
              )}</details>}
<details className={`${styles.card} group p-6`}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-lg font-bold"><Building2 aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> ผู้ว่าจ้าง / ผู้จ่ายค่าทนาย</span><span className={`block ${styles.hint}`}>กรอกเฉพาะเมื่อคนจ่ายเงินไม่ใช่ลูกความ — ใช้ออกใบแจ้งหนี้</span></span><span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">{customers.filter((row) => row.customerId).length ? `กรอกแล้ว ${customers.filter((row) => row.customerId).length} ราย` : 'ใช้ลูกความ'} · <ChevronDown aria-hidden="true" className="inline h-[1.1em] w-[1.1em] group-open:rotate-180" /> <span className="group-open:hidden">เปิด</span><span className="hidden group-open:inline">ปิด</span></span></summary><div className="mt-4 space-y-4">                <details className="rounded-lg border border-border p-3">
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

</div></details>
<details className={`${styles.card} group p-6`}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-lg font-bold"><Paperclip aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> เอกสารและอีเมล</span><span className={`block ${styles.hint}`}>แนบไฟล์หรือผูกอีเมลเข้าคดีเลย — ระบบช่วยอ่านไฟล์และเติมข้อมูลให้ได้</span></span><span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">{files.length + selectedEmails.length ? `แนบแล้ว ${files.length + selectedEmails.length} รายการ` : 'ยังไม่แนบ'} · <ChevronDown aria-hidden="true" className="inline h-[1.1em] w-[1.1em] group-open:rotate-180" /> <span className="group-open:hidden">เปิด</span><span className="hidden group-open:inline">ปิด</span></span></summary><div className="mt-4 space-y-4">              <details className="rounded-lg border border-border p-3">
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
                  opposingParty: opponents.map((row) => row.name).filter(Boolean).join(', '),
                  courtName: form.courtName,
                  incidentDate: form.customFields.incidentDate,
                  claimedAmount: form.claimedAmount,
                  estimatedDamage: form.customFields.estimatedDamage,
                }}
                onApply={applySuggestion}
              />
                </div>
              </details>

              <section className="space-y-3 rounded-lg border bg-card p-4"><h2 className="border-b pb-3 text-lg font-semibold">5 อีเมลที่เกี่ยวข้อง (ไม่บังคับ)</h2><p className="text-sm text-muted-foreground">ผูกอีเมลที่มีอยู่แล้วเข้าคดีตอนสร้าง — ไฟล์แนบจะเข้าแท็บเอกสาร · แสดงเฉพาะอีเมลในกล่องของคุณ</p>{token && <EmailLinkCandidates token={token} clientId={form.clientId} selected={selectedEmails} onChange={setSelectedEmails} />}</section>
</div></details>
<details className={`${styles.card} group p-6`}><summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-3 focus-visible:ring-2 focus-visible:ring-ring"><span><span className="block text-lg font-bold"><Settings2 aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> ชุดงานอัตโนมัติ</span><span className={`block ${styles.hint}`}>เลือกชุดงานอัตโนมัติ ระบบจะสร้างรายการงานของคดีให้หลังเปิดคดี</span></span><span className="rounded-full bg-[#eeebe3] px-3 py-1 text-sm">{playbookId || cargoClaimEnabled ? 'เลือกแล้ว' : 'ไม่ใช้'} · <ChevronDown aria-hidden="true" className="inline h-[1.1em] w-[1.1em] group-open:rotate-180" /> <span className="group-open:hidden">เปิด</span><span className="hidden group-open:inline">ปิด</span></span></summary><div className="mt-4 space-y-4">              <details className="rounded-lg border border-border p-3">
                <summary className="min-h-6 cursor-pointer text-sm font-medium">ขั้นตอนงานอัตโนมัติ / Cargo Claim{(cargoClaimEnabled || playbookId) && ' · เลือกแล้ว'}</summary>
                <p className="mt-2 text-xs text-muted-foreground">เปิดคดีก่อน แล้วดูรายการงานจากชุดงานเพื่อยืนยันเพิ่มงานในหน้าคดี</p>
              <label className="mt-4 block text-sm font-medium" htmlFor="new-case-playbook">
                ชุดงานอัตโนมัติ <span className="font-normal text-muted-foreground">(เลือกได้)</span>
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
                  <option value="">ไม่ใช้ชุดงานอัตโนมัติ</option>
                  <option value={CARGO_CLAIM_PLAYBOOK_KEY}>{CARGO_CLAIM_PLAYBOOK_NAME} · รุ่นล่าสุด</option>
                  {playbooks.filter((playbook) => playbook.templateKey !== CARGO_CLAIM_PLAYBOOK_KEY).map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>
                      {playbook.name} · ฉบับที่ {playbook.version}{playbook.caseTypeId === form.caseTypeId ? ' (แนะนำ)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              </details>

</div></details>
            </fieldset>
            <aside aria-label="สรุปก่อนเปิดคดี" className={`mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[#fffdfa] px-6 py-4 ${showValidation && missing.length ? "border-2 border-[#e9b9b9]" : ""}`}><div>{submitting ? <><strong>กำลังเปิดคดี…</strong><p className="text-sm text-muted-foreground">สร้างแฟ้มคดี · ตรวจผลประโยชน์ขัดกัน · แจ้งทีม — อย่าปิดหน้านี้</p></> : missing.length ? <><strong className="text-[#a83232]">กรอกช่องบังคับแล้ว {completed} จาก 4</strong><p className={styles.hint}>ยังขาด: {missing.map((item) => item.label).join(' · ')}</p></> : <><strong className="text-[#227052]"><Check aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> กรอกช่องบังคับครบแล้ว</strong><p className={styles.hint}>กด “เปิดคดี” แล้วระบบจะสร้างแฟ้มคดี ตรวจผลประโยชน์ขัดกัน และแจ้งทีมให้</p></>}</div><Button type="submit" className={`${styles.btn} ${styles.primary} px-8 text-base`} aria-disabled={submitting}>{submitting ? <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />กำลังเปิดคดี…</> : uploadFailures.length ? `ลองอัปโหลดอีกครั้ง (${uploadFailures.length} ไฟล์)` : 'เปิดคดี'}</Button></aside>
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
      {conflict && (
        <ConflictOverrideDialog
          matches={conflict}
          busy={submitting}
          onCancel={() => setConflict(null)}
          onConfirm={(reason) => void handleSubmit(reason)}
        />
      )}
    </div>
  );
}
