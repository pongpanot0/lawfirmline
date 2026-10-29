'use client';

import { useEffect, useState } from 'react';
import { Pencil, Trash2, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CaseParticipantItem, ClientItem } from '@/lib/api';
import { COUNSEL_ROLES, participantPayload, ROLE_LABELS, SIDE_LABELS } from '@/lib/participants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Role is not a status: the label carries it, so every role reads in one quiet tint.
const ROLE_BADGE_COLORS: Record<string, string> = {
  PLAINTIFF: 'bg-accent text-primary',
  JOINT_PLAINTIFF: 'bg-accent text-primary',
  OTHER: 'bg-muted text-foreground',
};

const SIDES = ['OURS', 'OPPONENT', 'NEUTRAL'];
const ROLES = Object.keys(ROLE_LABELS);

const emptyForm = {
  name: '',
  nickname: '',
  role: 'PLAINTIFF',
  side: 'OURS',
  clientId: '',
  representedByParticipantId: '',
  personType: '',
  idNumber: '',
  address: '',
  phone: '',
  email: '',
  opposingLawyer: '',
  opposingInsurer: '',
  medicalLicenseNo: '',
  notes: '',
};

type FormState = typeof emptyForm;

interface Props {
  caseId: string;
  initialParticipants?: CaseParticipantItem[];
  onChanged?: (participants: CaseParticipantItem[]) => void;
}

export function CaseParticipantsSection({ caseId, initialParticipants, onChanged }: Props) {
  const { token } = useAuth();
  const [participants, setParticipants] = useState<CaseParticipantItem[]>(initialParticipants ?? []);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clients, setClients] = useState<ClientItem[]>([]);
  useEffect(() => {
    if (!showForm || !token || clients.length) return;
    api.getClients(token).then(setClients).catch(() => setClients([]));
  }, [showForm, token, clients.length]);
  // The case page reloads after proceeding actions and stage moves; follow it unless a form is open.
  useEffect(() => { if (!showForm && initialParticipants) setParticipants(initialParticipants); }, [initialParticipants, showForm]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowAdvanced(false);
    setError('');
    setShowForm(true);
  };

  const openEdit = (p: CaseParticipantItem) => {
    setForm({
      name: p.name,
      nickname: p.nickname ?? '',
      role: p.role,
      side: p.side,
      clientId: p.clientId ?? '',
      representedByParticipantId: p.representedByParticipantId ?? '',
      personType: p.personType ?? '',
      idNumber: p.idNumber ?? '',
      address: p.address ?? '',
      phone: p.phone ?? '',
      email: p.email ?? '',
      opposingLawyer: p.opposingLawyer ?? '',
      opposingInsurer: p.opposingInsurer ?? '',
      medicalLicenseNo: p.medicalLicenseNo ?? '',
      notes: p.notes ?? '',
    });
    setEditingId(p.id);
    setShowAdvanced(false);
    setError('');
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    if (!form.name.trim()) {
      setError('กรุณาใส่ชื่อ');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data = participantPayload(form);
      if (editingId) {
        const updated = await api.updateParticipant(token, caseId, editingId, data);
        const next = participants.map((p) => (p.id === editingId ? updated : p));
        setParticipants(next);
        onChanged?.(next);
      } else {
        const created = await api.createParticipant(token, caseId, data);
        const next = [...participants, created];
        setParticipants(next);
        onChanged?.(next);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!token) return;
    if (!confirm(`ลบ "${name}" ออกจากรายชื่อคู่ความ?`)) return;
    try {
      await api.deleteParticipant(token, caseId, id);
      const next = participants.filter((p) => p.id !== id);
      setParticipants(next);
      onChanged?.(next);
    } catch (err) {
      console.error(err);
    }
  };

  const grouped = SIDES.map((side) => ({
    side,
    items: participants.filter((p) => p.side === side),
  })).filter((g) => g.items.length > 0);

  const allEmpty = participants.length === 0;

  return (
    <div className="col-span-full" data-testid="case-participants-field">
      <div className="flex flex-row items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">คู่ความและผู้เกี่ยวข้อง</h3>
          <p className="mt-1 text-sm text-muted-foreground">ระบุฐานะในคดีและฝ่ายที่สังกัด แล้วบันทึกคู่ความทีละราย</p>
        </div>
        {!showForm && (
          <Button variant="outline" className="min-h-11 shrink-0" onClick={openCreate}>
            <Plus className="h-3 w-3" />
            เพิ่มคู่ความ
          </Button>
        )}
      </div>
      <div className="mt-5 space-y-5">
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
          >
            <fieldset disabled={submitting} className="min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {editingId ? 'แก้ไขข้อมูลคู่ความ' : 'เพิ่มคู่ความ'}
              </p>
              <button type="button" aria-label="ยกเลิกกรอกคู่ความ" className="flex min-h-11 min-w-11 items-center justify-center" onClick={handleCancel}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="participant-name" className="text-sm font-medium">ชื่อบุคคลหรือชื่อนิติบุคคล *</label>
                <Input
                  id="participant-name"
                  autoFocus
                  required
                  placeholder="ชื่อ-นามสกุล หรือชื่อบริษัท"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 min-h-11"
                />
              </div>
              <div>
                <label htmlFor="participant-person-type" className="text-sm font-medium">ประเภทบุคคล</label>
                <select id="participant-person-type" value={form.personType} onChange={e => setForm({ ...form, personType: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                  <option value="">ยังไม่ระบุ</option><option value="บุคคลธรรมดา">บุคคลธรรมดา</option><option value="นิติบุคคล">นิติบุคคล</option>
                  {form.personType && !['บุคคลธรรมดา', 'นิติบุคคล'].includes(form.personType) && <option value={form.personType}>{form.personType}</option>}
                </select>
              </div>
              <div>
                <label htmlFor="case-participant-role" className="text-sm font-medium">ฐานะในคดี</label>
                <select
                  id="case-participant-role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="case-participant-side" className="text-sm font-medium">อยู่ฝ่ายใด</label>
                <select
                  id="case-participant-side"
                  value={form.side}
                  onChange={(e) => setForm({ ...form, side: e.target.value })}
                  className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {SIDES.map((s) => (
                    <option key={s} value={s}>{SIDE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              {form.side === 'OURS' && (
                <div>
                  <label htmlFor="participant-client" className="text-sm font-medium">ลูกความในทะเบียน (ถ้าเป็นคนเดียวกัน)</label>
                  <select id="participant-client" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                    <option value="">ไม่ผูก</option>
                    {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </div>
              )}
              {COUNSEL_ROLES.includes(form.role) && (
                <div>
                  <label htmlFor="participant-represents" className="text-sm font-medium">เป็นตัวแทนของ</label>
                  <select id="participant-represents" value={form.representedByParticipantId} onChange={e => setForm({ ...form, representedByParticipantId: e.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm">
                    <option value="">ยังไม่ระบุ</option>
                    {participants.filter(p => p.id !== editingId && !COUNSEL_ROLES.includes(p.role)).map(p => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABELS[p.role] ?? p.role})</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="participant-phone" className="text-sm font-medium">โทรศัพท์</label>
                <Input
                  placeholder="เบอร์โทร"
                  id="participant-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1 min-h-11"
                />
              </div>
              <div>
                <label htmlFor="participant-email" className="text-sm font-medium">อีเมล</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  id="participant-email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1 min-h-11"
                />
              </div>
            </div>

            <button
              type="button"
              className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAdvanced ? 'ซ่อนข้อมูลเพิ่มเติม' : 'เพิ่มที่อยู่ เลขประจำตัว และข้อมูลอื่น ๆ'}
            </button>

            {showAdvanced && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="participant-nickname" className="text-sm font-medium">ชื่อเรียก / ชื่อเล่น</label>
                  <Input
                    id="participant-nickname"
                    placeholder="ชื่อเรียก (ไม่บังคับ)"
                    value={form.nickname}
                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                    className="mt-1 min-h-11"
                  />
                </div>
                <div>
                  <label htmlFor="participant-idNumber" className="text-sm font-medium">เลขประจำตัวประชาชน / เลขทะเบียนนิติบุคคล</label>
                  <Input
                    placeholder="เลขบัตรประชาชน"
                    id="participant-idNumber"
                  value={form.idNumber}
                    onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                    className="mt-1 min-h-11"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="participant-address" className="text-sm font-medium">ที่อยู่</label>
                  <textarea
                    placeholder="ที่อยู่"
                    id="participant-address"
                  value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    rows={2}
                    className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                </div>
                <div>
                  <label htmlFor="participant-opposingLawyer" className="text-sm font-medium">ทนายฝ่ายตรงข้าม</label>
                  <Input
                    placeholder="ชื่อทนาย"
                    id="participant-opposingLawyer"
                  value={form.opposingLawyer}
                    onChange={(e) => setForm({ ...form, opposingLawyer: e.target.value })}
                    className="mt-1 min-h-11"
                  />
                </div>
                <div>
                  <label htmlFor="participant-opposingInsurer" className="text-sm font-medium">บริษัทประกันฝ่ายตรงข้าม</label>
                  <Input
                    placeholder="บริษัทประกัน"
                    id="participant-opposingInsurer"
                  value={form.opposingInsurer}
                    onChange={(e) => setForm({ ...form, opposingInsurer: e.target.value })}
                    className="mt-1 min-h-11"
                  />
                </div>
                <div>
                  <label htmlFor="participant-medicalLicenseNo" className="text-sm font-medium">เลขใบอนุญาตแพทย์ (ถ้ามี)</label>
                  <Input
                    placeholder="เลขใบอนุญาต"
                    id="participant-medicalLicenseNo"
                  value={form.medicalLicenseNo}
                    onChange={(e) => setForm({ ...form, medicalLicenseNo: e.target.value })}
                    className="mt-1 min-h-11"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="participant-notes" className="text-sm font-medium">หมายเหตุ</label>
                  <textarea
                    placeholder="หมายเหตุ"
                    id="participant-notes"
                  value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="mt-1 min-h-11 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                </div>
              </div>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? 'กำลังบันทึก...' : 'บันทึกคู่ความรายนี้'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                ยกเลิก
              </Button>
            </div>
            </fieldset>
          </form>
        )}

        {allEmpty && !showForm && (
          <p className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">ยังไม่มีคู่ความ กด “เพิ่มคู่ความ” เพื่อเพิ่มรายชื่อ</p>
        )}

        {grouped.map(({ side, items }) => (
          <div key={side} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold text-foreground">{SIDE_LABELS[side]}</p>
              <span className="text-xs text-muted-foreground">{items.length} ราย</span>
            </div>
            <div className="divide-y divide-border">
              {items.map((p) => (
                <div
                  key={p.id}
                  data-testid="case-participant-row"
                  className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    {p.nickname && <p className="text-xs text-muted-foreground">ชื่อเล่น: {p.nickname}</p>}
                    {p.representedByParticipantId && <p className="text-xs text-muted-foreground">ตัวแทนของ {participants.find(x => x.id === p.representedByParticipantId)?.name ?? '—'}</p>}
                    {p.clientId && <p className="text-xs text-muted-foreground">ลูกความในทะเบียน</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.phone && <span>{p.phone}</span>}
                      {p.email && <span>{p.email}</span>}
                      {p.opposingLawyer && <span>ทนาย: {p.opposingLawyer}</span>}
                      {p.opposingInsurer && <span>ประกัน: {p.opposingInsurer}</span>}
                      {p.medicalLicenseNo && <span>ใบอนุญาตแพทย์: {p.medicalLicenseNo}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <span className="text-xs text-muted-foreground">ฐานะ</span>
                    <span className={`rounded px-2 py-1 text-xs font-medium ${ROLE_BADGE_COLORS[p.role] ?? ROLE_BADGE_COLORS.OTHER}`}>
                      {ROLE_LABELS[p.role] ?? p.role}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
                      aria-label={`แก้ไข ${p.name}`}
                    >
                      <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
                      aria-label={`ลบ ${p.name}`}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
