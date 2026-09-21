'use client';

import { useEffect, useState } from 'react';
import { THAI_MONTHS, onlyDigits, daysInMonth, pad } from './ThaiDateInput';

interface Parts { d: string; m: string; yBe: string; time: string }

function parseValue(value?: string | null): Parts {
  if (!value) return { d: '', m: '', yBe: '', time: '' };
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = (datePart ?? '').split('-');
  if (!y || !m || !d) return { d: '', m: '', yBe: '', time: timePart ?? '' };
  return { d: String(Number(d)), m: String(Number(m)), yBe: String(Number(y) + 543), time: timePart ?? '' };
}

export interface ThaiDateTimeInputProps {
  /** `YYYY-MM-DDTHH:mm` (ปี ค.ศ.) เหมือน `<input type="datetime-local">` หรือ '' / null / undefined */
  value?: string | null;
  /** ได้ค่ากลับเป็น `YYYY-MM-DDTHH:mm` เหมือนกัน — แปลง พ.ศ.↔ค.ศ. ให้ในตัว */
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * ช่องเลือกวันที่+เวลาแบบไทย: วัน/เดือนไทยเต็ม/ปี พ.ศ. (เหมือน ThaiDateInput) บวกเวลา —
 * ค่าที่ส่งออกยังเป็น `YYYY-MM-DDTHH:mm` เดิมเหมือน `<input type="datetime-local">`
 */
export function ThaiDateTimeInput({ value, onChange, id, className, required, disabled }: ThaiDateTimeInputProps) {
  const [local, setLocal] = useState<Parts>(() => parseValue(value));

  useEffect(() => {
    setLocal(parseValue(value));
  }, [value]);

  const emit = (next: Parts) => {
    const d = Number(next.d);
    const m = Number(next.m);
    const yBe = Number(next.yBe);
    if (
      next.d && next.m && next.yBe.length === 4 && next.time &&
      d >= 1 && d <= 31 && m >= 1 && m <= 12 && !Number.isNaN(yBe)
    ) {
      const ad = yBe - 543;
      const clampedDay = Math.min(d, daysInMonth(ad, m));
      onChange(`${ad}-${pad(String(m))}-${pad(String(clampedDay))}T${next.time}`);
    }
  };

  const update = (patch: Partial<Parts>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    emit(next);
  };

  const textClass = 'h-9 w-14 shrink-0 rounded-lg border border-input bg-background px-2 text-center text-sm';
  const selectClass = 'h-9 min-w-[7.5rem] flex-1 rounded-lg border border-input bg-background px-2 text-sm';

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`} id={id}>
      <input
        aria-label="วัน"
        inputMode="numeric"
        placeholder="วว"
        maxLength={2}
        className={textClass}
        value={local.d}
        disabled={disabled}
        required={required}
        onChange={(e) => update({ d: onlyDigits(e.target.value, 2) })}
      />
      <select
        aria-label="เดือน"
        className={selectClass}
        value={local.m}
        disabled={disabled}
        required={required}
        onChange={(e) => update({ m: e.target.value })}
      >
        <option value="">เดือน</option>
        {THAI_MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </select>
      <input
        aria-label="ปี พ.ศ."
        inputMode="numeric"
        placeholder="ปี พ.ศ."
        maxLength={4}
        className={`${textClass} w-20`}
        value={local.yBe}
        disabled={disabled}
        required={required}
        onChange={(e) => update({ yBe: onlyDigits(e.target.value, 4) })}
      />
      <input
        aria-label="เวลา"
        type="time"
        className="h-9 w-28 shrink-0 rounded-lg border border-input bg-background px-2 text-sm"
        value={local.time}
        disabled={disabled}
        required={required}
        onChange={(e) => update({ time: e.target.value })}
      />
    </div>
  );
}
