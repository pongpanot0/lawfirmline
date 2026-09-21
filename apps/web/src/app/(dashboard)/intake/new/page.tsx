'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { canAssignFirmRole } from '@lawfirm/shared';
import { api, ClientItem, ApiError, IntakeItem, UserItem } from '@/lib/api';
import { CustomerSelect } from '@/components/billing/CustomerSelect';
import { InsurerSelect } from '@/components/InsurerSelect';
import { Button } from '@/components/ui/button';
import { MultiUserSelect } from '@/components/ui/MultiUserSelect';
import { DocumentDropZone } from '@/components/DocumentDropZone';

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
  // ลูกค้า = ผู้ว่าจ้าง/ผู้จ่ายเงิน (เช่น บริษัทประกัน) ต่างจากลูกความที่เราว่าความให้
  const [customers, setCustomers] = useState<{ customerId: string; sharePercent: string }[]>([
    { customerId: '', sharePercent: '' },
  ]);
  const [sameCustomer, setSameCustomer] = useState(false);
  // ลูกความคนอื่น (เกินคนที่ 1) — เช่น หลายคนร่วมฟ้อง/ถูกฟ้อง
  const [additionalClients, setAdditionalClients] = useState<{ clientId: string }[]>([]);
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  const [form, setForm] = useState({
    title: '',
    description: '',
    referralName: '',
    clientId: '',
    insurerName: '',
    policyNumber: '',
    claimNumber: '',
    clientContactId: '',
    clientName: '',
    clientType: 'INDIVIDUAL',
    contactName: '',
    receivedDate: today,
  });

  useEffect(() => {
    if (!token) return;
    api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
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
      if (assignedIds.length > 0) payload.assignedUserIds = assignedIds;
      if (clientId) {
        payload.clientId = clientId;
        if (clientDisplayName) payload.clientName = clientDisplayName;
      }
      // งานประกัน: กรอกตั้งแต่รับเรื่อง ระบบเปิดเคลมให้เองตอนแปลงเป็นคดี
      if (form.insurerName.trim()) {
        payload.insurerName = form.insurerName.trim();
        if (form.policyNumber.trim()) payload.policyNumber = form.policyNumber.trim();
        if (form.claimNumber.trim()) payload.claimNumber = form.claimNumber.trim();
      }
      const pickedCustomers = customers.filter((c) => c.customerId);
      if (pickedCustomers.length) {
        payload.customers = pickedCustomers.map((c, index) => ({
          customerId: c.customerId,
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
      router.push(`/intake/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl pb-20">
      <h1 className="mb-1 text-2xl font-bold">รับเรื่องใหม่</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        เลือกผู้มอบหมาย ตั้งชื่อเรื่องสั้น ๆ แล้วพิมพ์เหตุการณ์หรือแนบเอกสาร รายละเอียดอื่นเติมภายหลังได้
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset disabled={submitting} className="min-w-0 space-y-4">
          <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">บริษัทประกัน / ผู้มอบหมายงาน</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              คนที่จ้างเราและเป็นคนจ่าย เช่น บริษัทประกันที่จ้างให้ว่าความให้ผู้เอาประกัน — ถ้าลูกความจ่ายเอง เลือกคนเดียวกันได้ที่นี่
            </p>
            <div className="space-y-2">
              {customers.map((row, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <CustomerSelect
                      id={`intake-customer-${index}`}
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
                  </div>
                  {customers.length > 1 && <input
                    aria-label={`สัดส่วนที่จ่ายของรายที่ ${index + 1}`}
                    value={row.sharePercent}
                    onChange={(e) =>
                      setCustomers((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, sharePercent: e.target.value } : r)),
                      )
                    }
                    inputMode="decimal"
                    placeholder="%"
                    className="w-20 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />}
                  {customers.length > 1 && (
                    <button
                      type="button"
                      aria-label={`ลบลูกค้ารายที่ ${index + 1}`}
                      onClick={() => setCustomers((rows) => rows.filter((_, i) => i !== index))}
                      className="px-2 text-sm text-muted-foreground"
                    >
                      ลบ
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCustomers((rows) => [...rows, { customerId: '', sharePercent: '' }])}
                className="text-sm underline"
              >
                + เพิ่มผู้จ่ายอีกราย
              </button>
              <p hidden={customers.length < 2} className="text-xs text-muted-foreground">
                เว้น % ไว้ได้ถ้ายังไม่ตกลงสัดส่วน — รายแรกจะเป็นผู้ว่าจ้างหลัก
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={sameCustomer}
                  onChange={(e) => setSameCustomer(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                ลูกความคนเดียวกับผู้มอบหมายรายที่ 1
              </label>
            </div>
          </section>
          <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">ลูกความ (เราว่าความให้ใคร)</h2>
            </div>
            <div className="space-y-3">
            <div>
              <label htmlFor="intake-clientId" className="block text-sm font-medium">ลูกความในระบบ (ถ้ามี)</label>
              <select
                id="intake-clientId"
                value={form.clientId}
                onChange={(e) => handleClientChange(e.target.value)}
                disabled={sameCustomer}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="">ลูกความใหม่ / ยังไม่ระบุ</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {sameCustomer && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ใช้ค่าเดียวกับผู้มอบหมายรายที่ 1 — ยกเลิกติ๊กด้านบนเพื่อเลือกลูกความอื่น
                </p>
              )}
            </div>
            {additionalClients.length > 0 && (
              <div className="space-y-2">
                {additionalClients.map((row, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <CustomerSelect
                        id={`intake-additional-client-${index}`}
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
                    <button
                      type="button"
                      aria-label={`ลบลูกความรายที่ ${index + 2}`}
                      onClick={() => setAdditionalClients((rows) => rows.filter((_, i) => i !== index))}
                      className="px-2 text-sm text-muted-foreground"
                    >
                      ลบ
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setAdditionalClients((rows) => [...rows, { clientId: '' }])}
              className="text-sm underline"
            >
              + เพิ่มลูกความอีกราย
            </button>
            {clientsLoading && <p role="status" className="text-sm text-muted-foreground">กำลังโหลดรายชื่อลูกค้า…</p>}
            {clientsError && (
              <p role="alert" className="text-sm text-destructive">
                โหลดลูกค้าไม่สำเร็จ{' '}
                <button type="button" className="underline" onClick={() => setClientsRetry((value) => value + 1)}>ลองใหม่</button>
              </p>
            )}
            {form.clientId && selectedClient && (
              <div>
                <label htmlFor="intake-clientContactId" className="block text-sm font-medium">บุคคลติดต่อ / ผู้ส่งเรื่อง (ถ้ามี)</label>
                <select
                  id="intake-clientContactId"
                  value={form.clientContactId}
                  onChange={(e) => handleContactChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">ยังไม่ทราบ</option>
                  {selectedClient.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{(c as { nickname?: string }).nickname ? ` (${(c as { nickname?: string }).nickname})` : ''}{c.isPrimary ? ' ★' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!form.clientId && !sameCustomer && (
              <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                <p className="text-sm text-muted-foreground">
                  กรอกชื่อแล้วระบบจะสร้างลูกความให้อัตโนมัติตอนบันทึก — เติมข้อมูลอื่นทีหลังได้
                </p>
                <div>
                  <label htmlFor="intake-clientName" className="block text-sm font-medium">ชื่อลูกความ</label>
                  <input
                    id="intake-clientName"
                    value={form.clientName}
                    onChange={(e) => set('clientName', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="intake-clientType" className="block text-sm font-medium">ประเภทลูกความ</label>
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
                    <label htmlFor="intake-contactName" className="block text-sm font-medium">ชื่อผู้ติดต่อ</label>
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
            </div>
          </section>
          <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">เรื่องที่รับ</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="intake-title" className="block text-sm font-medium">ชื่อเรื่อง *</label>
                <input
                  id="intake-title"
                  required
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="เช่น ต่อสู้คดีอุบัติเหตุ — เลขเคลม 12345"
                />
              </div>
              <div>
                <label htmlFor="intake-receivedDate" className="block text-sm font-medium">วันที่รับเรื่อง *</label>
                <input
                  id="intake-receivedDate"
                  type="date"
                  required
                  value={form.receivedDate}
                  onChange={(e) => set('receivedDate', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <label htmlFor="intake-description" className="block text-sm font-medium">เหตุการณ์ / คำสั่งมอบหมาย (ถ้ามี)</label>
              <textarea id="intake-description" rows={4} maxLength={12000} value={form.description} onChange={(e) => set('description', e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="วางข้อความจากอีเมล หรือเล่าเรื่องที่ต้องการให้ดำเนินการ แล้วใช้ค้นฎีกาหรือจัดข้อเท็จจริงต่อได้" />
              <DocumentDropZone multiple accept=".pdf,.txt,application/pdf,text/plain" label="แนบเอกสารมอบหมาย (ไม่บังคับ)" hint="PDF / TXT ไม่เกิน 30MB ต่อไฟล์ · บันทึกเรื่องก่อนเลือกใช้ AI" disabled={submitting || !!createdIntakeId} onFiles={(incoming) => {
                if (incoming.some((file) => file.size > 30 * 1024 * 1024 || !['application/pdf', 'text/plain'].includes(file.type))) { setError('เลือก PDF / TXT ไม่เกิน 30MB ต่อไฟล์'); return; }
                const next = [...files]; for (const file of incoming) if (!next.some((f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) next.push(file);
                if (next.length > 10) { setError('เลือกได้สูงสุด 10 ไฟล์'); return; } setFiles(next); setError('');
              }} />
              {files.map((file,index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{file.name}</span><button type="button" onClick={() => setFiles((prev) => prev.filter((_,i) => i !== index))} className="shrink-0 text-primary">เอาออก</button></div>)}
            </div>
          </section>

          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">ข้อมูลเคลม และทีม (เติมภายหลังได้)</summary>
            <div className="mt-3 space-y-3">
          <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">ประกันภัย (ถ้ามี)</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              กรอกบริษัทประกันไว้ ระบบจะเปิดการติดตามเคลมให้เองตอนแปลงเป็นคดี
            </p>
            <div className="space-y-3">
              <div>
                <label htmlFor="intake-insurerName" className="block text-sm font-medium">บริษัทประกัน</label>
                <InsurerSelect
                  id="intake-insurerName"
                  value={form.insurerName}
                  onChange={(name) => set('insurerName', name)}
                />
              </div>
              {form.insurerName.trim() && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="intake-policyNumber" className="block text-sm font-medium">เลขกรมธรรม์</label>
                    <input
                      id="intake-policyNumber"
                      value={form.policyNumber}
                      onChange={(e) => set('policyNumber', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="intake-claimNumber" className="block text-sm font-medium">เลขเคลม</label>
                    <input
                      id="intake-claimNumber"
                      value={form.claimNumber}
                      onChange={(e) => set('claimNumber', e.target.value)}
                      className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {assignable.length > 0 && (
            <section className="rounded-xl border bg-card p-4 shadow-sm sm:p-5">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="font-semibold">ทีมผู้รับผิดชอบ</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                มอบหมายได้เฉพาะสมาชิกที่มีบทบาทต่ำกว่าของคุณ — ตัวคุณเป็นผู้รับเรื่องอยู่แล้ว
              </p>
              <div className="mt-2">
                <MultiUserSelect
                  users={assignable}
                  value={assignedIds}
                  onChange={setAssignedIds}
                  placeholder="เลือกผู้รับผิดชอบ — เลือกได้หลายคน"
                  renderExtra={(u) => (u.firmRole ? (FIRM_ROLE_LABELS[u.firmRole] ?? u.firmRole) : '')}
                />
                {assignedIds.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">เลือกแล้ว {assignedIds.length} คน</p>
                )}
              </div>
            </section>
          )}

            </div>
          </details>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm">
            <Button type="button" variant="outline" disabled={submitting || !!createdIntakeId} onClick={() => router.push('/intake')}>
              ยกเลิก
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'กำลังบันทึก...'
                : createdIntakeId
                  ? 'แนบไฟล์ที่เหลืออีกครั้ง'
                  : 'บันทึกและเปิดพื้นที่ทำงาน'}
            </Button>
          </div>
        </fieldset>
      </form>
      {/*
        Optional and credit-metered, so it sits below the form as a closed
        disclosure: the two required fields come first.
      */}
    </div>
  );
}
