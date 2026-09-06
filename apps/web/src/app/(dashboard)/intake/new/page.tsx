'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, ClientItem, ApiError, IntakeItem, CaseItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { getCaseStatusDisplay } from '@/lib/case-status';

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

export default function NewIntakePage() {
  const { token } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toISOString().slice(0, 10);

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
  });
  const [clientCases, setClientCases] = useState<CaseItem[]>([]);

  useEffect(() => {
    if (!token) return;
    api.getClients(token).catch(() => [] as ClientItem[]).then(setClients);
  }, [token]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const selectedClient = clients.find((c) => c.id === form.clientId) ?? null;
  const selectedContact = selectedClient?.contacts.find((c) => c.id === form.clientContactId) ?? null;

  const handleClientChange = (clientId: string) => {
    setForm((f) => ({ ...f, clientId, clientContactId: '', referralName: '', relatedCaseId: '' }));
    setClientCases([]);
    if (clientId && token) {
      api
        .getClient(token, clientId)
        .then((full) => setClientCases(full.cases ?? []))
        .catch(() => setClientCases([]));
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
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
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
      };
      if (form.clientId) {
        payload.clientId = form.clientId;
      } else if (form.clientName) {
        payload.clientName = form.clientName;
      }
      const created = await api.createIntake(token, payload) as IntakeItem;
      router.push(`/intake/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <h1 className="mb-1 text-2xl font-bold">รับเรื่องใหม่</h1>
      <p className="mb-6 text-sm text-muted-foreground">บันทึกข้อมูลเรื่องที่รับเข้ามา</p>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        {/* ชื่อคดี */}
        <div>
          <label className="block text-sm font-medium">ชื่อคดี *</label>
          <input
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            placeholder="เช่น คดีแพ่งโรงพยาบาล X กับ นาย ก."
          />
        </div>

        {/* ผู้ส่งเรื่อง */}
        <div className="space-y-3">
          <h2 className="font-semibold">ผู้ส่งเรื่อง</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">ประเภทผู้ส่ง</label>
              <select
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
              <label className="block text-sm font-medium">ช่องทาง</label>
              <select
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
            <label className="block text-sm font-medium">ชื่อผู้ส่งเรื่อง</label>
            <input
              value={form.referralName}
              onChange={(e) => set('referralName', e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              placeholder="ชื่อ-นามสกุล หรือชื่อองค์กร"
            />
          </div>
        </div>

        {/* ลูกค้า */}
        <div className="space-y-3">
          <h2 className="font-semibold">ลูกค้า</h2>
          <div>
            <label className="block text-sm font-medium">ลูกค้าในระบบ (ถ้ามี)</label>
            <select
              value={form.clientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">-- ไม่เลือก --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {form.clientId && selectedClient && (
            <div>
              <label className="block text-sm font-medium">บุคคลติดต่อ / ผู้ส่งเรื่อง *</label>
              <select
                value={form.clientContactId}
                onChange={(e) => handleContactChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                required
              >
                <option value="">-- เลือกบุคคลติดต่อ --</option>
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
              <label className="block text-sm font-medium">ชื่อลูกค้า (ถ้ายังไม่มีในระบบ)</label>
              <input
                value={form.clientName}
                onChange={(e) => set('clientName', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
              />
            </div>
          )}
          {form.clientId && clientCases.length > 0 && (
            <div>
              <label className="block text-sm font-medium">ผูกกับคดีที่มีอยู่แล้ว (ถ้าเรื่องนี้เกี่ยวกับคดีเดิม)</label>
              <select
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

        {/* คดีเดินอยู่แล้วที่อื่น */}
        <div className="space-y-3">
          <h2 className="font-semibold">คดีเดินอยู่แล้วที่อื่น (ถ้ามี)</h2>
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
                <label className="block text-sm font-medium">เลขคดี/หมายเลขดำ (ถ้าทราบ)</label>
                <input
                  value={form.externalCaseNumber}
                  onChange={(e) => set('externalCaseNumber', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="เช่น ดำที่ 123/2569"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">สถานะปัจจุบัน</label>
                <input
                  value={form.currentStageNote}
                  onChange={(e) => set('currentStageNote', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  placeholder="เช่น นัดสืบพยาน 15 ต.ค."
                />
              </div>
            </div>
          )}
        </div>

        {/* รายละเอียดเรื่อง */}
        <div className="space-y-3">
          <h2 className="font-semibold">รายละเอียดเรื่อง</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">ประเภทเรื่อง</label>
              <select
                value={form.matterType}
                onChange={(e) => set('matterType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">-- เลือก --</option>
                {Object.entries(MATTER_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium">คู่กรณี</label>
              <input
                value={form.opposingParty}
                onChange={(e) => set('opposingParty', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="ชื่อคู่กรณี"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium">วันเกิดเหตุ</label>
              <input
                type="date"
                value={form.incidentDate}
                onChange={(e) => set('incidentDate', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">ความเสียหายโดยประมาณ (บาท)</label>
              <input
                type="number"
                value={form.estimatedDamage}
                onChange={(e) => set('estimatedDamage', e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                placeholder="เช่น 500000"
                min={0}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium">รายละเอียด</label>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
              placeholder="อธิบายเรื่องที่รับโดยย่อ"
            />
          </div>
        </div>

        {/* วันที่รับเรื่อง */}
        <div>
          <label className="block text-sm font-medium">วันที่รับเรื่อง *</label>
          <input
            type="date"
            required
            value={form.receivedDate}
            onChange={(e) => set('receivedDate', e.target.value)}
            className="mt-1 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            ยกเลิก
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'กำลังบันทึก...' : 'บันทึกเรื่อง'}
          </Button>
        </div>
      </form>
    </div>
  );
}
