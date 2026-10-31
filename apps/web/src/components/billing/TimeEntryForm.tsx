'use client';

import { useEffect, useState } from 'react';
import { MONEY_HINT, MONEY_MAX, MONEY_MIN } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseListItem } from '@/lib/api';
import { bangkokDateInputToIso, bangkokDateInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { SelectField, TextField } from '@/components/ui/form-fields';

export type EditableTimeEntry = { id: string; caseId: string; date: string; hours: number; rate: number; description: string | null };

const isHoursInRange = (hours: string) => {
  const n = Number(hours);
  return hours !== '' && !Number.isNaN(n) && n >= 0.25 && n <= 24;
};

/**
 * เพิ่ม/แก้เวลาทำงานเอง. caseId ระบุ = คดีตายตัว (หน้าคดี); ไม่ระบุ = เลือกคดีเอง (หน้า /timesheet).
 * entry ระบุ = แก้ (ไม่มีช่องคิดเงิน/ไม่คิดเงิน — ตั้งได้ตอนสร้างเท่านั้น); ไม่ระบุ = เพิ่มใหม่ เติมอัตราจากค่าเริ่มต้นของสมาชิก.
 */
export function TimeEntryForm({
  caseId,
  entry,
  onDone,
  onCancel,
}: {
  caseId?: string;
  entry?: EditableTimeEntry;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { token } = useAuth();
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [pickedCaseId, setPickedCaseId] = useState(entry?.caseId ?? caseId ?? '');
  const [date, setDate] = useState(() => (entry ? bangkokDateInputValue(entry.date) : bangkokDateInputValue(new Date())));
  const [hours, setHours] = useState(entry ? String(entry.hours) : '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [rate, setRate] = useState(entry ? String(entry.rate) : '');
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || caseId || entry) return;
    api.getCases(token).then(setCases).catch(() => setError('โหลดรายการคดีไม่สำเร็จ'));
  }, [token, caseId, entry]);

  useEffect(() => {
    if (!token || entry) return;
    api.getDefaultTimeRate(token).then((r) => setRate(String(r.rate))).catch(() => {});
  }, [token, entry]);

  const valid = !!pickedCaseId && !!date && isHoursInRange(hours);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !valid || saving) return;
    setSaving(true);
    setError('');
    const body = {
      hours: Number(hours),
      rate: rate === '' ? undefined : Number(rate),
      description: description.trim() || undefined,
      date: bangkokDateInputToIso(date),
    };
    try {
      if (entry) await api.updateTimeEntry(token, entry.caseId, entry.id, body);
      else await api.createTimeEntry(token, pickedCaseId, { ...body, billable });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกเวลาไม่สำเร็จ กรุณาลองใหม่');
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      {!caseId && !entry && (
        <SelectField label="คดี" required value={pickedCaseId} onChange={(e) => setPickedCaseId(e.target.value)}>
          <option value="">เลือกคดี</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>{c.ownRef} · {c.title}</option>
          ))}
        </SelectField>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">วันที่</span>
          <ThaiDateInput value={date} onChange={setDate} required />
        </div>
        <TextField
          label="ชั่วโมง"
          required
          type="number"
          step={0.25}
          min={0.25}
          max={24}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <div className="space-y-1.5">
          <label htmlFor="time-entry-rate" className="block text-sm font-medium">อัตราต่อชั่วโมง (฿)</label>
          <MoneyInput
            id="time-entry-rate"
            min={MONEY_MIN}
            max={MONEY_MAX}
            title={MONEY_HINT}
            value={rate}
            onValueChange={setRate}
            className="min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-right text-sm tabular-nums"
          />
        </div>
      </div>
      <TextField label="รายละเอียด" value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
      {!entry && (
        <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
          <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} className="h-4 w-4 rounded border-input" />
          คิดเงินลูกความ
        </label>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={!valid || saving}>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>ยกเลิก</Button>
      </div>
    </form>
  );
}
