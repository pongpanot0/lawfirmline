'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ClientItem, ApiError, IntakeItem, FieldSuggestion } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { BatchAnalysisPanel } from '@/components/documents/BatchAnalysisPanel';
import { SuggestedFieldsPanel } from '@/components/documents/SuggestedFieldsPanel';

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
  const [files, setFiles] = useState<File[]>([]);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [createdIntakeId, setCreatedIntakeId] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  const [form, setForm] = useState({
    title: '',
    referralName: '',
    clientId: '',
    clientContactId: '',
    clientName: '',
    contactName: '',
    receivedDate: today,
  });
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
        referralType: 'INDIVIDUAL',
        referralChannel: 'WALK_IN',
        referralName,
        receivedDate: form.receivedDate,
        preLitigationType: 'GENERAL',
        preLitigationStatus: 'NOT_STARTED',
      };
      if (clientId) {
        payload.clientId = clientId;
        if (clientDisplayName) payload.clientName = clientDisplayName;
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
    <div className="mx-auto w-full max-w-2xl pb-20">
      <h1 className="mb-1 text-2xl font-bold">รับเรื่องใหม่</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        กรอกแค่ชื่อเรื่องกับลูกค้า แล้วไปเติมรายละเอียดต่อที่หน้าเรื่อง
      </p>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-card p-4 sm:p-6 shadow-sm">
        <fieldset disabled={submitting} className="min-w-0 space-y-5">
          <div>
            <label htmlFor="intake-title" className="block text-sm font-medium">ชื่อเรื่อง *</label>
            <input
              id="intake-title"
              required
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="เช่น เรียกเงินคืนจากผู้รับเหมา"
            />
          </div>

          <div className="space-y-3">
            <h2 className="font-semibold">ลูกค้า</h2>
            <div>
              <label htmlFor="intake-clientId" className="block text-sm font-medium">ลูกค้าในระบบ (ถ้ามี)</label>
              <select
                id="intake-clientId"
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
            {!form.clientId && (
              <div className="space-y-3 rounded-lg border border-dashed border-border p-3">
                <p className="text-sm text-muted-foreground">
                  กรอกชื่อแล้วระบบจะสร้างลูกค้าให้อัตโนมัติตอนบันทึก — เติมข้อมูลอื่นทีหลังได้
                </p>
                <div>
                  <label htmlFor="intake-clientName" className="block text-sm font-medium">ชื่อลูกค้า</label>
                  <input
                    id="intake-clientName"
                    value={form.clientName}
                    onChange={(e) => set('clientName', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
                  />
                </div>
                <div>
                  <label htmlFor="intake-contactName" className="block text-sm font-medium">ชื่อผู้ติดต่อ</label>
                  <input
                    id="intake-contactName"
                    value={form.contactName}
                    onChange={(e) => set('contactName', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    placeholder="ถ้าไม่กรอกจะใช้ชื่อลูกค้า"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="intake-receivedDate" className="block text-sm font-medium">วันที่รับเรื่อง *</label>
            <input
              id="intake-receivedDate"
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
                  : 'สร้างเรื่องและไปเติมรายละเอียด'}
            </Button>
          </div>
        </fieldset>
      </form>
      {/*
        Optional and credit-metered, so it sits below the form as a closed
        disclosure: the two required fields come first.
      */}
      <details className="group mt-6 rounded-xl border bg-card shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">▸</span>
          วิเคราะห์เนื้อหาไฟล์ด้วย AI (ไม่บังคับ)
        </summary>
        <div className="border-t p-4 sm:p-6">
          <div>
            <BatchAnalysisPanel
              files={files}
              onFilesChange={setFiles}
              onBusyChange={setAnalysisBusy}
              onFieldSuggestions={setSuggestions}
              entityLabel="เรื่อง"
              disabled={submitting || !!createdIntakeId}
            />
          </div>

          {suggestions.length > 0 && (
            <div className="mt-4">
              <SuggestedFieldsPanel
                suggestions={suggestions}
                accepts={['title']}
                current={{ title: form.title }}
                onApply={(field, value) =>
                  setForm((previous) => ({
                    ...previous,
                    [field]: value,
                  }))
                }
              />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
