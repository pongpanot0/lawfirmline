'use client';

import { useEffect, useState } from 'react';
import { daysInMonth, isInvalidParts, pad, parseIsoParts, partsToIso, MIN_BE_YEAR, type ThaiDateParts } from '@/lib/thai-date';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

/** เลขไทย → เลขอารบิก เหมือน pattern ที่ใช้กับช่องหมายเลขคดีดำ/หมายเลขคดีแดง */
export function toArabicDigits(input: string) {
  return input.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 3664));
}

export function onlyDigits(input: string, maxLength: number) {
  return toArabicDigits(input).replace(/[^0-9]/g, '').slice(0, maxLength);
}

export { daysInMonth, pad };

type Parts = ThaiDateParts;

export interface ThaiDateInputProps {
  /** ISO `yyyy-mm-dd` (ปี ค.ศ. เหมือน `<input type="date">`) หรือ '' / null / undefined */
  value?: string | null;
  /** ได้ค่ากลับเป็น ISO `yyyy-mm-dd` เหมือนกัน — แปลง พ.ศ.↔ค.ศ. ให้ในตัว */
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * ช่องเลือกวันที่แบบไทย: วัน (พิมพ์ได้ รับเลขไทย) / เดือนไทยเต็ม (เลือกจาก dropdown) /
 * ปี พ.ศ. (พิมพ์ได้ รับเลขไทย) — ค่าที่ส่งออกยังเป็น ISO ค.ศ. เดิมเหมือน `<input type="date">`
 */
export function ThaiDateInput({ value, onChange, id, className, required, disabled }: ThaiDateInputProps) {
  const [local, setLocal] = useState<Parts>(() => parseIsoParts(value));

  useEffect(() => {
    // Only resync when the parent's value is not what we already show — a cleared
    // (incomplete) date must not wipe what the user is still typing.
    setLocal((cur) => (partsToIso(cur) === (value ?? '') ? cur : parseIsoParts(value)));
  }, [value]);

  // '' on incomplete/invalid so the stale date is never submitted.
  const emit = (next: Parts) => onChange(partsToIso(next));

  const update = (patch: Partial<Parts>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    emit(next);
  };

  const invalid = isInvalidParts(local);
  const textClass = 'h-9 w-14 shrink-0 rounded-lg border border-input bg-background px-2 text-center text-sm';
  const selectClass = 'h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm';

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
        aria-invalid={invalid || undefined}
        className={`${textClass} w-20 ${invalid ? 'border-destructive' : ''}`}
        value={local.yBe}
        disabled={disabled}
        required={required}
        onChange={(e) => update({ yBe: onlyDigits(e.target.value, 4) })}
      />
      {invalid && (
        <p role="alert" className="basis-full text-xs text-destructive">
          วันที่ไม่ถูกต้อง — ปี พ.ศ. ต้องไม่ต่ำกว่า {MIN_BE_YEAR}
        </p>
      )}
    </div>
  );
}
