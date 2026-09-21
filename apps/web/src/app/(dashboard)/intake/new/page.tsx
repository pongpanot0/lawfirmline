'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { canAssignFirmRole } from '@lawfirm/shared';
import { api, ClientItem, ApiError, IntakeItem, UserItem, CaseTypeItem } from '@/lib/api';
import { PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { Plus, X } from 'lucide-react';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';

const FIRM_ROLE_LABELS: Record<string, string> = {
  OWNER: 'เจ้าของ',
  SENIOR_LAWYER: 'ทนายอาวุโส',
  LAWYER: 'ทนายความ',
  ASSISTANT: 'ผู้ช่วย',
};

export default function NewIntakePage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const clientRequest = useRef(0);
  const submitLock = useRef(false);
  const [clientsError, setClientsError] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsRetry, setClientsRetry] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  // Same rule as the intake detail page and the API: assign only roles below yours.
  const assignable = user
    ? lawyers.filter(
        (u) => u.id !== user.id && u.firmRole != null && canAssignFirmRole(user.firmRole, u.firmRole),
      )
    : [];
  const [createdIntakeId, setCreatedIntakeId] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  // ลูกค้า = ผู้ว่าจ้าง/ผู้จ่ายเงิน (เช่น บริษัทประกัน) ต่างจากลูกความที่เราว่าความให้
  const [customers, setCustomers] = useState<{ customerId: string; sharePercent: string; contactId?: string }[]>([
    { customerId: '', sharePercent: '', contactId: '' },
  ]);
  const [sameCustomer, setSameCustomer] = useState(false);
  // ลูกความคนอื่น (เกินคนที่ 1) — เช่น หลายคนร่วมฟ้อง/ถูกฟ้อง
  const [additionalClients, setAdditionalClients] = useState<{ clientId: string }[]>([]);
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  const [form, setForm] = useState({
    title: '',
    partyRole: '',
    opposingParty: '',
    description: '',
    referralName: '',
    clientId: '',
    clientContactId: '',
    clientName: '',
    clientType: 'INDIVIDUAL',
    contactName: '',
    receivedDate: today,
    caseTypeId: '',
    policyNumber: '',
    claimNumber: '',
    playbookId: '',
    leadLawyerId: '',
  });
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);

  useEffect(() => {
    if (!token) return;
    api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
    api.getCaseTypes(token, true).then(setCaseTypes).catch(() => setCaseTypes([]));
    setupRequest<PlaybookRelease[]>(token, '/playbooks').then(setPlaybooks).catch(() => setPlaybooks([]));
  }, [token]);

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
    clientRequest.current += 1;
    const client = clients.find((item) => item.id === clientId);
    const contact = client?.contacts.find((item) => item.isPrimary) ?? (client?.contacts.length === 1 ? client.contacts[0] : undefined);
    setForm((f) => ({
      ...f,
      clientId,
      clientContactId: contact?.id ?? '',
      referralName: contact?.name ?? '',
      clientName: '',
      contactName: '',
    }));
    if (!clientId) setCreatedClientId(null);
  };

  // ลูกค้าคนเดียวกับลูกความ — ตราบใดที่ติ้กไว้ ผู้มอบหมายรายที่ 1 เป็นตัวกำหนด ลูกความตามไปด้วย
  useEffect(() => {
    if (sameCustomer) handleClientChange(customers[0]?.customerId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sameCustomer, customers[0]?.customerId]);

  const handleContactChange = (contactId: string) => {
    const client = clients.find((c) => c.id === form.clientId);
    const contact = client?.contacts.find((c) => c.id === contactId);
    const name = contact ? `${contact.name}${(contact as { nickname?: string }).nickname ? ` (${(contact as { nickname?: string }).nickname})` : ''}` : '';
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
      const newClientName = form.clientName.trim();
      let clientId = form.clientId || createdClientId || '';
      let clientDisplayName =
        clients.find((c) => c.id === clientId)?.name
        ?? (newClientName || undefined);
      let referralName = form.referralName.trim() || undefined;

      if (!clientId && newClientName) {
        const contactName = form.contactName.trim() || newClientName;
        const createdClient = await api.createClient(token, {
          name: newClientName,
          type: form.clientType,
          contacts: [{ name: contactName, isPrimary: true }],
        });
        clientId = createdClient.id;
        clientDisplayName = createdClient.name;
        referralName = contactName;
        setCreatedClientId(createdClient.id);
        setForm((f) => ({
          ...f,
          clientId: createdClient.id,
          clientContactId: createdClient.contacts.find((c) => c.isPrimary)?.id
            ?? createdClient.contacts[0]?.id
            ?? '',
          referralName: contactName,
          clientName: '',
          contactName: '',
        }));
        setClients((previous) =>
          previous.some((c) => c.id === createdClient.id)
            ? previous
            : [...previous, createdClient].sort((a, b) => a.name.localeCompare(b.name, 'th')),
        );
      }

      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        referralType: customers.some((c) => c.customerId) ? 'COMPANY' : 'INDIVIDUAL',
        referralChannel: 'OTHER',
        description: form.description.trim() || undefined,
        referralName,
        receivedDate: form.receivedDate,
        preLitigationType: 'GENERAL',
        preLitigationStatus: 'NOT_STARTED',
      };
      if (form.partyRole) payload.partyRole = form.partyRole;
      if (form.opposingParty.trim()) payload.opposingParty = form.opposingParty.trim();
      if (form.caseTypeId) payload.caseTypeId = form.caseTypeId;
      if (form.playbookId) payload.preferredPlaybookId = form.playbookId;
      if (form.policyNumber.trim()) payload.policyNumber = form.policyNumber.trim();
      if (form.claimNumber.trim()) payload.claimNumber = form.claimNumber.trim();
      if (form.leadLawyerId) payload.leadLawyerId = form.leadLawyerId;
      if (assignedIds.length > 0) payload.assignedUserIds = assignedIds;
      if (clientId) {
        payload.clientId = clientId;
        if (clientDisplayName) payload.clientName = clientDisplayName;
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
        setError(`บันทึกเรื่องแล้ว แต่แนบไฟล์ไม่สำเร็จ ${failedFiles.length} ไฟล์ (รองรับ PDF / TXT) กดอีกครั้งเพื่อแนบไฟล์ที่เหลือ โดยไม่บันทึกซ้ำ`);
        submitLock.current = false;
        setSubmitting(false);
        return;
      }
      // Record เดียวตั้งแต่รับเรื่อง — คดีเปิดแล้ว พาไป case detail เสมอ
      // (รอบ retry แนบไฟล์ created มีแค่ id — ดึงข้อมูลเต็มมาหา case ก่อน)
      let createdCase = (created as IntakeItem).case;
      if (!createdCase?.id) {
        createdCase = await api.getIntake(token, created.id).then((it) => it.case ?? undefined).catch(() => undefined);
      }
      router.push(createdCase?.id ? `/cases/${createdCase.id}` : `/intake/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl pb-20">
      <h1 className="mb-1 text-2xl font-bold">รับเรื่องใหม่</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        กรอกเท่าที่รู้ — บันทึกแล้วได้ workspace เต็ม (งานจาก playbook, checklist เอกสาร, ทีม) เติมที่เหลือทีหลังได้
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={submitting} className="min-w-0 space-y-4">

          {/* 1 · เรื่องที่รับ */}
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 flex items-baseline gap-2.5 border-b border-border pb-2.5 text-[15px] font-bold tracking-tight"><span className="font-mono text-[13px] font-semibold text-primary">01</span>เรื่องที่รับ</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="intake-title" className="block text-xs font-semibold">ชื่อเรื่อง *</label>
                <input
                  id="intake-title"
                  required
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3.5 text-[15px] font-medium"
                  placeholder="เช่น ต่อสู้คดีอุบัติเหตุ — เลขเคลม 12345"
                />
              </div>
              <div>
                <label htmlFor="intake-receivedDate" className="block text-xs font-semibold">วันที่รับเรื่อง *</label>
                <ThaiDateInput id="intake-receivedDate" required value={form.receivedDate} onChange={(v) => set('receivedDate', v)} className="mt-1 !flex-nowrap [&>select]:!min-w-0" />
              </div>
              <div>
                <label htmlFor="intake-partyRole" className="block text-xs font-semibold">ฝ่ายเรา</label>
                <select
                  id="intake-partyRole"
                  value={form.partyRole}
                  onChange={(e) => set('partyRole', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">ไม่ระบุ</option>
                  <option value="PLAINTIFF">โจทก์ (ฝ่ายเราฟ้อง)</option>
                  <option value="DEFENDANT">จำเลย (ฝ่ายเราถูกฟ้อง)</option>
                </select>
              </div>
              <div>
                <label htmlFor="intake-caseTypeId" className="block text-xs font-semibold">ประเภทคดี</label>
                <select
                  id="intake-caseTypeId"
                  value={form.caseTypeId}
                  onChange={(e) => {
                    const caseTypeId = e.target.value;
                    const matched = playbooks.find((p) => p.caseTypeId === caseTypeId)?.id ?? '';
                    setForm((f) => ({ ...f, caseTypeId, playbookId: matched }));
                  }}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">ยังไม่ทราบ</option>
                  {caseTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="intake-opposingParty" className="block text-xs font-semibold">คู่กรณี</label>
                <input
                  id="intake-opposingParty"
                  value={form.opposingParty}
                  onChange={(e) => set('opposingParty', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="ชื่อคู่กรณี"
                />
              </div>
              <div>
                <label htmlFor="intake-policyNumber" className="block text-xs font-semibold">เลขกรมธรรม์</label>
                <input
                  id="intake-policyNumber"
                  value={form.policyNumber}
                  onChange={(e) => set('policyNumber', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="POL-..."
                />
              </div>
              <div>
                <label htmlFor="intake-claimNumber" className="block text-xs font-semibold">เลขเคลม</label>
                <input
                  id="intake-claimNumber"
                  value={form.claimNumber}
                  onChange={(e) => set('claimNumber', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="CLM-..."
                />
              </div>
              <div className="mt-1 border-t border-dashed border-border pt-3 sm:col-span-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">ทีมและแนวทาง</p>
              </div>
              <div>
                <label htmlFor="intake-playbookId" className="block text-xs font-semibold">Playbook</label>
                <select
                  id="intake-playbookId"
                  value={form.playbookId}
                  onChange={(e) => set('playbookId', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm"
                >
                  <option value="">— ไม่ใช้ —</option>
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · v{p.version}{p.caseTypeId === form.caseTypeId && form.caseTypeId ? ' (แนะนำตามประเภทคดี)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="intake-leadLawyerId" className="block text-xs font-semibold">ทนายหลัก</label>
                <select
                  id="intake-leadLawyerId"
                  value={form.leadLawyerId}
                  onChange={(e) => set('leadLawyerId', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">
                    {user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'ฉันเอง' : 'ฉันเอง'} (ฉันเอง)
                  </option>
                  {lawyers.filter((u) => u.id !== user?.id).map((u) => (
                    <option key={u.id} value={u.id}>
                      {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold">ผู้ช่วย / ทีม</label>
                <div className="mt-1">
                  {assignable.length > 0 ? (
                    <MultiUserSelect
                      users={assignable}
                      value={assignedIds}
                      onChange={setAssignedIds}
                      placeholder="+ เพิ่มผู้ช่วย — เลือกได้หลายคน"
                      renderExtra={(u) => (u.firmRole ? (FIRM_ROLE_LABELS[u.firmRole] ?? u.firmRole) : '')}
                    />
                  ) : (
                    <p className="py-2 text-xs text-muted-foreground">ยังไม่มีสมาชิกที่มอบหมายได้</p>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3">
              <label htmlFor="intake-description" className="block text-xs font-semibold">เหตุการณ์ / คำสั่งมอบหมาย</label>
              <textarea
                id="intake-description"
                rows={3}
                maxLength={12000}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className="mt-1 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="วางข้อความจากอีเมล หรือเล่าเหตุการณ์ — ใช้ให้ AI ช่วยวิเคราะห์/ค้นฎีกาต่อได้"
              />
            </div>
          </section>

          {/* 2 · ลูกความ และผู้มอบหมาย/ผู้จ่าย */}
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 flex items-baseline gap-2.5 border-b border-border pb-2.5 text-[15px] font-bold tracking-tight"><span className="font-mono text-[13px] font-semibold text-primary">02</span>ผู้มอบหมาย และลูกความ</h2>

            {/* ผู้มอบหมายมาก่อน — คนที่จ้างเราคือจุดเริ่มของเรื่อง */}
            <div>
              {customers.map((row, index) => (
                <div key={index} className="mb-3">
                  <p className="mb-1 text-sm font-semibold">
                    ผู้มอบหมายรายที่ {index + 1}{' '}
                    {index === 0 && <span className="font-normal text-muted-foreground">— คนที่จ้างเราและเป็นคนจ่าย เช่น บริษัทประกัน</span>}
                  </p>
                  <div className="grid items-start gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <CustomerSelect
                          id={`intake-customer-${index}`}
                          label=""
                          value={row.customerId}
                          clients={clients}
                          onChange={(customerId) =>
                            setCustomers((rows) => rows.map((r, i) => (i === index ? { ...r, customerId } : r)))
                          }
                          onCreated={(client) =>
                            setClients((rows) => [...rows, client].sort((a, b) => a.name.localeCompare(b.name, 'th')))
                          }
                        />
                      </div>
                      {customers.length > 1 && (
                        <input
                          aria-label={`สัดส่วนที่จ่ายของรายที่ ${index + 1}`}
                          value={row.sharePercent}
                          onChange={(e) =>
                            setCustomers((rows) => rows.map((r, i) => (i === index ? { ...r, sharePercent: e.target.value } : r)))
                          }
                          inputMode="decimal"
                          placeholder="%"
                          className="w-16 rounded-lg border border-input bg-background px-2 py-2 text-sm"
                        />
                      )}
                      {customers.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`ลบผู้มอบหมายรายที่ ${index + 1}`}
                          onClick={() => setCustomers((rows) => rows.filter((_, i) => i !== index))}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div>
                      {(() => {
                        const contacts = clients.find((c) => c.id === row.customerId)?.contacts ?? [];
                        return (
                          <select
                            aria-label={`คนติดต่อของผู้มอบหมายรายที่ ${index + 1}`}
                            value={row.contactId ?? ''}
                            disabled={!row.customerId || contacts.length === 0}
                            onChange={(e) =>
                              setCustomers((rows) => rows.map((r, i) => (i === index ? { ...r, contactId: e.target.value } : r)))
                            }
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
                          >
                            <option value="">คนติดต่อ — ไม่ระบุ</option>
                            {contacts.map((ct) => (
                              <option key={ct.id} value={ct.id}>{ct.name}{ct.phone ? ` · ${ct.phone}` : ''}</option>
                            ))}
                          </select>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setCustomers((rows) => [...rows, { customerId: '', sharePercent: '', contactId: '' }])}
                >
                  + เพิ่มผู้จ่ายอีกราย
                </button>
                <label className="flex items-center gap-2">
                  <Checkbox checked={sameCustomer} onChange={(e) => setSameCustomer(e.target.checked)} />
                  ลูกความคนเดียวกับผู้มอบหมาย
                </label>
              </div>
              <p hidden={customers.length < 2} className="mt-1 text-xs text-muted-foreground">
                เว้น % ไว้ได้ถ้ายังไม่ตกลงสัดส่วน — รายแรกจะเป็นผู้ว่าจ้างหลัก
              </p>
            </div>

            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <label htmlFor="intake-clientId" className="block text-xs font-semibold">ลูกความ *</label>
                <div className="mt-1 flex gap-2">
                  <select
                    id="intake-clientId"
                    value={form.clientId}
                    onChange={(e) => { handleClientChange(e.target.value); if (e.target.value) setShowNewClient(false); }}
                    disabled={sameCustomer}
                    className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                  >
                    <option value="">— เลือกลูกความ —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => { setShowNewClient((v) => !v); handleClientChange(''); }} disabled={sameCustomer}>
                    <Plus className="h-3.5 w-3.5" /> ใหม่
                  </Button>
                </div>
                {sameCustomer && (
                  <p className="mt-1 text-xs text-muted-foreground">ใช้ค่าเดียวกับผู้มอบหมายรายที่ 1</p>
                )}
                {clientsLoading && <p role="status" className="mt-1 text-xs text-muted-foreground">กำลังโหลดรายชื่อ…</p>}
                {clientsError && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    โหลดลูกค้าไม่สำเร็จ{' '}
                    <button type="button" className="underline" onClick={() => setClientsRetry((value) => value + 1)}>ลองใหม่</button>
                  </p>
                )}
                {form.clientId && selectedClient && selectedClient.contacts.length > 0 && (
                  <select
                    aria-label="บุคคลติดต่อ / ผู้ส่งเรื่อง"
                    value={form.clientContactId}
                    onChange={(e) => handleContactChange(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">บุคคลติดต่อ — ยังไม่ทราบ</option>
                    {selectedClient.contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}{(c as { nickname?: string }).nickname ? ` (${(c as { nickname?: string }).nickname})` : ''}{c.isPrimary ? ' ★' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold">ลูกความเพิ่มเติม (ร่วมฟ้อง/ถูกฟ้อง)</label>
                {additionalClients.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setAdditionalClients((rows) => [...rows, { clientId: '' }])}
                    className="mt-1 w-full rounded-lg border border-dashed border-input px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
                  >
                    + เพิ่มลูกความ
                  </button>
                ) : (
                  <div className="mt-1 space-y-2">
                    {additionalClients.map((row, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <CustomerSelect
                            id={`intake-additional-client-${index}`}
                            label=""
                            value={row.clientId}
                            clients={clients}
                            onChange={(clientId) =>
                              setAdditionalClients((rows) => rows.map((r, i) => (i === index ? { ...r, clientId } : r)))
                            }
                            onCreated={(client) =>
                              setClients((rows) => [...rows, client].sort((a, b) => a.name.localeCompare(b.name, 'th')))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`ลบลูกความรายที่ ${index + 2}`}
                          onClick={() => setAdditionalClients((rows) => rows.filter((_, i) => i !== index))}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <button type="button" className="text-sm text-primary hover:underline" onClick={() => setAdditionalClients((rows) => [...rows, { clientId: '' }])}>
                      + เพิ่มลูกความอีกราย
                    </button>
                  </div>
                )}
              </div>
            </div>

            {showNewClient && !form.clientId && !sameCustomer && (
              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border p-3">
                <p className="text-sm text-muted-foreground">กรอกชื่อแล้วระบบจะสร้างลูกความให้อัตโนมัติตอนบันทึก</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="intake-clientName" className="block text-xs font-semibold">ชื่อลูกความ</label>
                    <input
                      id="intake-clientName"
                      value={form.clientName}
                      onChange={(e) => set('clientName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
                    />
                  </div>
                  <div>
                    <label htmlFor="intake-clientType" className="block text-xs font-semibold">ประเภทลูกความ</label>
                    <select
                      id="intake-clientType"
                      value={form.clientType}
                      onChange={(e) => set('clientType', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="INDIVIDUAL">บุคคลธรรมดา</option>
                      <option value="COMPANY">นิติบุคคล</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="intake-contactName" className="block text-xs font-semibold">ชื่อผู้ติดต่อ</label>
                    <input
                      id="intake-contactName"
                      value={form.contactName}
                      onChange={(e) => set('contactName', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="ถ้าไม่กรอกจะใช้ชื่อลูกความ"
                    />
                  </div>
                </div>
              </div>
            )}

          </section>

          {/* 3 · เอกสารเริ่มต้น */}
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 flex items-baseline gap-2.5 border-b border-border pb-2.5 text-[15px] font-bold tracking-tight"><span className="font-mono text-[13px] font-semibold text-primary">03</span>เอกสารเริ่มต้น</h2>
            <DocumentDropZone
              multiple
              accept=".pdf,.txt,application/pdf,text/plain"
              label="ลากไฟล์มาวางที่นี่ หรือกดเลือกไฟล์จากเครื่อง"
              hint="อัปได้หลายไฟล์พร้อมกัน (PDF / TXT ไม่เกิน 30MB) — บันทึกแล้วกดให้ AI ช่วยจับคู่ checklist ได้"
              disabled={submitting || !!createdIntakeId}
              onFiles={(incoming) => {
                if (incoming.some((file) => file.size > 30 * 1024 * 1024 || !['application/pdf', 'text/plain'].includes(file.type))) { setError('เลือก PDF / TXT ไม่เกิน 30MB ต่อไฟล์'); return; }
                const next = [...files]; for (const file of incoming) if (!next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) next.push(file);
                if (next.length > 10) { setError('เลือกได้สูงสุด 10 ไฟล์'); return; } setFiles(next); setError('');
              }}
            />
            {files.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <span className="min-w-0 break-words">📄 {file.name}</span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))} className="shrink-0 text-xs text-primary">เอาออก</button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">checklist เอกสารตามประเภทคดีจะถูกสร้างให้อัตโนมัติหลังบันทึก</p>
          </section>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {/* แถบบันทึกลอยติดล่าง — กดได้โดยไม่ต้อง scroll สุดฟอร์ม */}
          <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-2 border-t border-border bg-background/90 px-1 py-3 backdrop-blur">
            <Button type="button" variant="outline" disabled={submitting || !!createdIntakeId} onClick={() => router.push('/intake')}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting} className="px-5">
              {submitting
                ? 'กำลังบันทึก...'
                : createdIntakeId
                  ? 'แนบไฟล์ที่เหลืออีกครั้ง'
                  : 'บันทึก → เปิดพื้นที่ทำงาน'}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
