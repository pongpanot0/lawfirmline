'use client';

// Hallmark · genre: modern-minimal · fingerprint: hanging / single-column / hairline / solid-primary / no-imagery / no-reveal · tone: soft · anchor: Samnuan blue
// Hallmark · contrast: pass (40–41) · responsive: pass (34, 49–57) · pre-emit: P5 H5 E4 S5 R5 V5

import { ClientCombobox } from './ClientCombobox';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { CreateClientContactDialog } from '@/components/intake/CreateClientContactDialog';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  api,
  UserItem,
  CaseTypeItem,
  ClientItem,
  ApiError,
  WorkloadSummary,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, X } from 'lucide-react';
import type { CaseFieldSchema } from '@lawfirm/shared';
import {
  TMP_CLIENT_PLACEHOLDER,
  CourtLevel,
  CARGO_CLAIM_PLAYBOOK_KEY,
  CARGO_CLAIM_PLAYBOOK_NAME,
} from '@lawfirm/shared';

export default function NewCasePage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submittingRef = useRef(false);
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
  const [playbookId, setPlaybookId] = useState('');
  const [cargoClaimEnabled, setCargoClaimEnabled] = useState(false);

  const [form, setForm] = useState({
    caseTypeId: '',
    title: '',
    clientId: '',
    clientName: '',
    clientType: 'INDIVIDUAL',
    useTmpClient: false,
    chargeSection: '',
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

  const validationMessage = (targetStep: number) => {
    if (targetStep === 0) {
      if (!form.caseTypeId) return 'เลือกประเภทคดีก่อนดำเนินการต่อ';
      if (!form.title.trim()) return 'กรุณากรอกชื่อคดี';
      const missing = fieldSchema.find(
        (f) => f.required && !(f.key === 'chargeSection' ? form.chargeSection : form.customFields[f.key])?.trim(),
      );
      if (missing) return `กรุณากรอก${missing.label}`;
    }
    if (targetStep === 1 && !lawyers.some((l) => l.id === form.leadLawyerId))
      return 'กรุณาเลือกทนายผู้รับผิดชอบ';
    return '';
  };
  // Keep the creation flow to case identity, required type-specific fields, and owner.
  const visibleSteps = [
    { value: 0, label: 'ข้อมูลคดี' },
    { value: 1, label: 'ผู้รับผิดชอบ' },
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
    if (!token || submittingRef.current) return;
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
        title: form.title.trim(),
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
              เลือกประเภทคดี ระบุคู่กรณี และมอบหมายทนายผู้รับผิดชอบ
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
              if (step === 1) void handleSubmit();
              else goNext();
            }}
            className="min-w-0 space-y-4 text-card-foreground"
          >
            <fieldset
              disabled={submitting}
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
                ? 'ระบุเฉพาะข้อมูลที่ใช้เริ่มคดี'
                : 'เลือกทนายหลักและตรวจสอบข้อมูล'}
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
            <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-soft sm:p-6">
              <section className="space-y-3" aria-label="ประเภทคดี">
                <div>
                  <h3 className="text-sm font-semibold">ประเภทคดี <span className="text-destructive">*</span></h3>
                  <p className="mt-1 text-xs text-muted-foreground">เลือกประเภทให้ระบบเตรียมแบบฟอร์มและขั้นตอนที่ตรงกับคดี</p>
                </div>
                {loadingTypes ? (
                  <p className="text-sm text-muted-foreground">กำลังโหลดประเภทคดี…</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {caseTypes.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        aria-pressed={form.caseTypeId === type.id}
                        onClick={() => {
                          setForm((current) =>
                            current.caseTypeId === type.id
                              ? current
                              : { ...current, caseTypeId: type.id, customFields: {}, chargeSection: '' },
                          );
                          setPlaybookId((current) => current || playbooks.find((playbook) => playbook.caseTypeId === type.id)?.id || current);
                        }}
                        className={"min-h-11 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (form.caseTypeId === type.id ? "border-primary/50 bg-primary/[0.055]" : "border-border bg-background hover:border-primary/25 hover:bg-muted/60")}
                      >
                        <span className="flex items-center justify-between gap-2 font-medium">
                          {type.name}
                          <span aria-hidden="true" className={"flex h-4 w-4 items-center justify-center rounded-full border text-[10px] " + (form.caseTypeId === type.id ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 text-transparent")}>✓</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <label className="block text-sm font-medium" htmlFor="new-case-playbook">
                มาตรฐานงานอัตโนมัติ <span className="font-normal text-muted-foreground">(เลือกได้)</span>
                <select
                  id="new-case-playbook"
                  className={inputClass}
                  value={cargoClaimEnabled ? CARGO_CLAIM_PLAYBOOK_KEY : playbookId}
                  onChange={(event) => {
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

              <section className="space-y-3 border-t border-border pt-5" aria-label="ลูกความและผู้ว่าจ้าง">
                <h3 className="text-base font-bold tracking-tight">ลูกความและผู้ว่าจ้าง</h3>
                <div className="space-y-2">
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

                <div>
                  <label htmlFor="client-combobox" className={fieldLabel}>ลูกความ</label>
                  <ClientCombobox
                    id="client-combobox"
                    clients={clients}
                    clientId={form.clientId}
                    clientName={form.clientName}
                    disabled={form.useTmpClient || sameCustomer}
                    onSelectClient={(client) => setForm({ ...form, clientId: client.id, clientName: client.name, useTmpClient: false })}
                    onFreeText={(clientName) => setForm({ ...form, clientId: '', clientName })}
                  />
                  {form.clientName.trim() && !form.clientId && !form.useTmpClient && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>ชื่อนี้จะเพิ่มเป็นลูกความใหม่เมื่อสร้างคดี · ประเภท</span>
                      <select aria-label="ประเภทลูกความใหม่" value={form.clientType} onChange={(event) => setForm({ ...form, clientType: event.target.value })} className="min-h-9 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
                        <option value="INDIVIDUAL">บุคคลธรรมดา</option>
                        <option value="COMPANY">นิติบุคคล</option>
                      </select>
                    </div>
                  )}
                  <label className="mt-2 flex items-center gap-2 text-sm">
                    <Checkbox checked={form.useTmpClient} onChange={(event) => setForm({ ...form, useTmpClient: event.target.checked, clientId: event.target.checked ? '' : form.clientId })} />
                    ยังไม่ทราบชื่อลูกความ
                  </label>
                  {sameCustomer && <p className="mt-1 text-xs text-muted-foreground">ใช้ชื่อเดียวกับผู้ว่าจ้างรายแรก</p>}
                </div>
              </section>

              <div className="border-t border-border pt-5">
                <label htmlFor="case-title" className={fieldLabel}>ชื่อคดี <span className="text-destructive">*</span></label>
                <input
                  id="case-title"
                  required
                  value={form.title}
                  onChange={(event) => {
                    setAutoTitle(false);
                    setForm({ ...form, title: event.target.value });
                  }}
                  className={inputClass}
                  placeholder="เช่น เรียกชำระหนี้ — บริษัท ตัวอย่าง"
                />
                {autoTitle && <p className="mt-1 text-xs text-muted-foreground">ตั้งชื่อจากประเภทคดีและลูกความให้อัตโนมัติ แก้ไขได้</p>}
              </div>

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
          )}

          {step === 1 && (
            <div className="space-y-5 rounded-2xl border border-border/80 bg-card p-4 shadow-soft sm:p-6">
              <label htmlFor="lead-lawyer" className="block text-sm font-medium">
                ทนายผู้รับผิดชอบ <span className="text-destructive">*</span>
                <select
                  id="lead-lawyer"
                  required
                  value={form.leadLawyerId}
                  onChange={(event) => setForm({ ...form, leadLawyerId: event.target.value })}
                  className={inputClass}
                >
                  <option value="">เลือกทนายผู้รับผิดชอบ</option>
                  {lawyers.map((lawyer) => <option key={lawyer.id} value={lawyer.id}>{lawyer.firstName} {lawyer.lastName}{workloadLabel(lawyer.id)}</option>)}
                </select>
              </label>
              <section className="border-t border-border pt-5" aria-labelledby="review-heading">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="review-heading" className="font-semibold">ตรวจสอบก่อนสร้าง</h3>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setStep(0); setError(''); }}>แก้ไขข้อมูล</Button>
                </div>
                <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                  {[
                    ['ประเภทคดี', selectedType?.name || 'ยังไม่เลือก'],
                    ['ลูกความ', overviewClientName],
                    ['ผู้ว่าจ้าง', primaryCustomerName],
                    ['ชื่อคดี', form.title],
                    ['มาตรฐานงาน', cargoClaimEnabled ? CARGO_CLAIM_PLAYBOOK_NAME : (playbooks.find((playbook) => playbook.id === playbookId)?.name || 'ไม่ใช้')],
                    ['ทนายผู้รับผิดชอบ', selectedLawyer ? selectedLawyer.firstName + ' ' + selectedLawyer.lastName : 'ยังไม่ได้เลือก'],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-medium">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          )}
            </fieldset>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card py-3 pl-4 pr-20 sm:px-5">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 whitespace-nowrap active:bg-accent/80"
            disabled={submitting}
            onClick={goBack}
          >
            {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
          </Button>
          <Button
            type="submit"
            className="min-h-11 whitespace-nowrap px-5 active:bg-primary/80"
            disabled={
              submitting ||
              loadingTypes ||
              (step === 0 && !caseTypes.length)
            }
          >
            {submitting
              ? 'กำลังบันทึก…'
              : step === 1
                ? 'สร้างคดี'
                : 'ถัดไป'}
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
