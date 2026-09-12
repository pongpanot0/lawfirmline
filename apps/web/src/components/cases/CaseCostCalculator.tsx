'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  CaseCostLine,
  caseCostTotal,
  CASE_COSTS_KEY,
  initialCaseCosts,
  readCaseCosts,
} from '@/lib/case-costs';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';

export function CaseCostCalculator({
  value,
  onChange,
  disabled = false,
}: {
  value: CaseCostLine[];
  onChange: (lines: CaseCostLine[]) => void;
  disabled?: boolean;
}) {
  const prefix = useId();
  const result = caseCostTotal(value);
  const change = (index: number, field: keyof CaseCostLine, text: string) =>
    onChange(
      value.map((line, i) => (i === index ? { ...line, [field]: text } : line)),
    );
  return (
    <section
      className="space-y-3 rounded-xl border border-border bg-card p-4"
      aria-label="ประมาณการค่าใช้จ่ายคดี"
    >
      <h2 className="font-semibold">ประมาณการค่าใช้จ่ายคดี</h2>
      <p className="text-sm text-muted-foreground">
        ระบุอัตราของสำนักงานและจำนวนครั้ง ระบบคูณและรวมให้ทันที
        อัตราเหล่านี้ไม่ใช่อัตราค่าธรรมเนียมศาลตามกฎหมาย
      </p>
      {value.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border p-3 text-sm">
          <span className="text-muted-foreground">ยังไม่มีประมาณการสำหรับคดีนี้</span>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(initialCaseCosts())}
          >
            เริ่มประมาณการ
          </Button>
        </div>
      )}
      {value.map((line, index) => (
        <div
          key={index}
          className="grid min-w-0 gap-3 rounded-lg border border-border p-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label
              htmlFor={`${prefix}-${index}-label`}
              className="text-xs text-muted-foreground"
            >
              รายการ
            </label>
            <input
              id={`${prefix}-${index}-label`}
              disabled={disabled}
              value={line.label}
              onChange={(e) => change(index, 'label', e.target.value)}
              className="mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-${index}-quantity`}
              className="text-xs text-muted-foreground"
            >
              จำนวนครั้ง / หน่วย
            </label>
            <input
              id={`${prefix}-${index}-quantity`}
              disabled={disabled}
              type="number"
              min="0"
              max="1000"
              step="1"
              value={line.quantity}
              onChange={(e) => change(index, 'quantity', e.target.value)}
              className="mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-${index}-rate`}
              className="text-xs text-muted-foreground"
            >
              บาทต่อหน่วย
            </label>
            <input
              id={`${prefix}-${index}-rate`}
              disabled={disabled}
              type="number"
              min="0"
              max="999999999"
              step="0.01"
              value={line.rate}
              placeholder="ระบุอัตรา"
              onChange={(e) => change(index, 'rate', e.target.value)}
              className="mt-1 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm sm:col-span-2">
            <span>
              {result.amounts[index] === null
                ? 'ยังระบุอัตราหรือจำนวนไม่ครบ'
                : formatCurrency(result.amounts[index]! / 100)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              นำรายการออก
            </Button>
          </div>
        </div>
      ))}
      {value.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || value.length >= 20}
          onClick={() =>
            onChange([
              ...value,
              { label: 'ค่าใช้จ่ายเพิ่มเติม', quantity: '1', rate: '' },
            ])
          }
        >
          เพิ่มรายการ
        </Button>
      )}
      {value.length > 0 && (
        <>
          <p
            className="border-t border-border pt-3 text-sm font-semibold"
            aria-live="polite"
          >
            {result.incomplete ? 'รวมเฉพาะรายการที่กรอกครบ' : 'รวมประมาณการ'}:{' '}
            {formatCurrency(result.totalCents / 100)}
          </p>
          <p className="text-xs text-muted-foreground">
            เป็นประมาณการ ยังไม่สร้างรายการเบิกจ่ายหรือใบแจ้งหนี้
          </p>
        </>
      )}
    </section>
  );
}

export function SavedCaseCostCalculator({
  caseId,
  customFields,
  onSaved,
}: {
  caseId: string;
  customFields: Record<string, unknown> | null;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const [lines, setLines] = useState(() =>
    readCaseCosts(customFields?.[CASE_COSTS_KEY], () => []),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // Removing the last line is itself a change worth saving; hiding the button
  // on an empty list left a stale estimate stored with no way to clear it.
  const [dirty, setDirty] = useState(false);
  const save = async () => {
    if (!token || saving) return;
    setSaving(true);
    setMessage('');
    try {
      // Refresh before merging so unrelated case custom fields are retained.
      const current = await api.getCase(token, caseId);
      await api.updateCase(token, caseId, {
        customFields: {
          ...((current.customFields as Record<string, unknown>) ?? {}),
          [CASE_COSTS_KEY]: JSON.stringify(lines),
        },
      });
      setMessage('บันทึกประมาณการแล้ว');
      setDirty(false);
      onSaved();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3">
      <CaseCostCalculator
        value={lines}
        onChange={(updated) => {
          setLines(updated);
          setDirty(true);
          setMessage('');
        }}
        disabled={saving}
      />
      {(lines.length > 0 || dirty) && (
        <Button type="button" variant="outline" disabled={saving} onClick={save}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกประมาณการ'}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
