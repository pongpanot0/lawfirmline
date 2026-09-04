'use client';

import { useState } from 'react';
import { Pencil, Trash2, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CaseParticipantItem } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ROLE_LABELS: Record<string, string> = {
  PLAINTIFF: 'โจทก์',
  DEFENDANT: 'จำเลย',
  PETITIONER: 'ผู้ร้อง',
  RESPONDENT: 'ผู้คัดค้าน',
  WITNESS: 'พยาน',
  EXPERT: 'ผู้เชี่ยวชาญ',
  OPPOSING_LAWYER: 'ทนายฝ่ายตรงข้าม',
  OPPOSING_INSURER: 'บริษัทประกันฝ่ายตรงข้าม',
  OTHER: 'อื่นๆ',
};

const SIDE_LABELS: Record<string, string> = {
  OURS: 'ฝ่ายเรา',
  OPPONENT: 'ฝ่ายตรงข้าม',
  NEUTRAL: 'กลาง',
};

const SIDE_COLORS: Record<string, string> = {
  OURS: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  OPPONENT: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  NEUTRAL: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  PLAINTIFF: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  DEFENDANT: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  PETITIONER: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  RESPONDENT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  WITNESS: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  EXPERT: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  OPPOSING_LAWYER: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  OPPOSING_INSURER: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
  OTHER: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const SIDES = ['OURS', 'OPPONENT', 'NEUTRAL'];
const ROLES = Object.keys(ROLE_LABELS);

const emptyForm = {
  name: '',
  nickname: '',
  role: 'PLAINTIFF',
  side: 'OURS',
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
}

export function CaseParticipantsSection({ caseId, initialParticipants }: Props) {
  const { token } = useAuth();
  const [participants, setParticipants] = useState<CaseParticipantItem[]>(initialParticipants ?? []);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    if (!token) return;
    if (!form.name.trim()) {
      setError('กรุณาใส่ชื่อ');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const data: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        data[k] = v === '' ? null : v;
      }
      if (editingId) {
        const updated = await api.updateParticipant(token, caseId, editingId, data);
        setParticipants((prev) => prev.map((p) => (p.id === editingId ? updated : p)));
      } else {
        const created = await api.createParticipant(token, caseId, data);
        setParticipants((prev) => [...prev, created]);
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
      setParticipants((prev) => prev.filter((p) => p.id !== id));
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
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-sm">คู่ความ / Participants</CardTitle>
        {!showForm && (
          <Button variant="outline" size="sm" onClick={openCreate}>
            <Plus className="h-3 w-3" />
            เพิ่มคู่ความ
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="rounded-lg border border-border bg-muted/30 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {editingId ? 'แก้ไขข้อมูลคู่ความ' : 'เพิ่มคู่ความ'}
              </p>
              <button type="button" onClick={handleCancel}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">ชื่อ-นามสกุล *</label>
                <Input
                  required
                  placeholder="ชื่อ-นามสกุล"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ชื่อเล่น / Nickname</label>
                <Input
                  placeholder="ชื่อเล่น"
                  value={form.nickname}
                  onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">บทบาท / Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ฝ่าย / Side</label>
                <select
                  value={form.side}
                  onChange={(e) => setForm({ ...form, side: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                >
                  {SIDES.map((s) => (
                    <option key={s} value={s}>{SIDE_LABELS[s]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">เบอร์โทร / Phone</label>
                <Input
                  placeholder="เบอร์โทร"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>

            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAdvanced ? 'ซ่อนข้อมูลเพิ่มเติม' : 'ข้อมูลเพิ่มเติม'}
            </button>

            {showAdvanced && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground">ประเภทบุคคล</label>
                  <Input
                    placeholder="นิติบุคคล / บุคคลธรรมดา"
                    value={form.personType}
                    onChange={(e) => setForm({ ...form, personType: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">เลขบัตรประชาชน / ID</label>
                  <Input
                    placeholder="เลขบัตรประชาชน"
                    value={form.idNumber}
                    onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">ที่อยู่</label>
                  <textarea
                    placeholder="ที่อยู่"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">ทนายฝ่ายตรงข้าม</label>
                  <Input
                    placeholder="ชื่อทนาย"
                    value={form.opposingLawyer}
                    onChange={(e) => setForm({ ...form, opposingLawyer: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">ประกันฝ่ายตรงข้าม</label>
                  <Input
                    placeholder="บริษัทประกัน"
                    value={form.opposingInsurer}
                    onChange={(e) => setForm({ ...form, opposingInsurer: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">เลขใบอนุญาตแพทย์</label>
                  <Input
                    placeholder="เลขใบอนุญาต"
                    value={form.medicalLicenseNo}
                    onChange={(e) => setForm({ ...form, medicalLicenseNo: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground">หมายเหตุ</label>
                  <textarea
                    placeholder="หมายเหตุ"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? 'กำลังบันทึก...' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่มคู่ความ'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                ยกเลิก
              </Button>
            </div>
          </form>
        )}

        {allEmpty && !showForm && (
          <p className="text-sm text-muted-foreground">ยังไม่มีคู่ความ กด "เพิ่มคู่ความ" เพื่อเพิ่มรายชื่อ</p>
        )}

        {grouped.map(({ side, items }) => (
          <div key={side}>
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {SIDE_LABELS[side]}
            </p>
            <div className="space-y-2">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">
                        {p.name}
                        {p.nickname ? ` (${p.nickname})` : ''}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${ROLE_BADGE_COLORS[p.role] ?? ROLE_BADGE_COLORS.OTHER}`}>
                        {ROLE_LABELS[p.role] ?? p.role}
                      </span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SIDE_COLORS[p.side] ?? SIDE_COLORS.NEUTRAL}`}>
                        {SIDE_LABELS[p.side] ?? p.side}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {p.phone && <span>{p.phone}</span>}
                      {p.email && <span>{p.email}</span>}
                      {p.opposingLawyer && <span>ทนาย: {p.opposingLawyer}</span>}
                      {p.opposingInsurer && <span>ประกัน: {p.opposingInsurer}</span>}
                      {p.medicalLicenseNo && <span>ใบอนุญาตแพทย์: {p.medicalLicenseNo}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="แก้ไข"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.name)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                      title="ลบ"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
