'use client';

import { useEffect, useState } from 'react';

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

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function pad(value: string) {
  return value.padStart(2, '0');
}

interface Parts { d: string; m: string; yBe: string }

function parseIso(value?: string | null): Parts {
  if (!value) return { d: '', m: '', yBe: '' };
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return { d: '', m: '', yBe: '' };
  return { d: String(Number(d)), m: String(Number(m)), yBe: String(Number(y) + 543) };
}

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
  const [local, setLocal] = useState<Parts>(() => parseIso(value));

  useEffect(() => {
    setLocal(parseIso(value));
  }, [value]);

  const emit = (next: Parts) => {
    const d = Number(next.d);
    const m = Number(next.m);
    const yBe = Number(next.yBe);
    if (next.d && next.m && next.yBe.length === 4 && d >= 1 && d <= 31 && m >= 1 && m <= 12 && !Number.isNaN(yBe)) {
      const ad = yBe - 543;
      const clampedDay = Math.min(d, daysInMonth(ad, m));
      onChange(`${ad}-${pad(String(m))}-${pad(String(clampedDay))}`);
    }
  };

  const update = (patch: Partial<Parts>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    emit(next);
  };

  const textClass = 'h-9 w-14 shrink-0 rounded-lg border border-input bg-background px-2 text-center text-sm';
  const selectClass = 'h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm';

  return (
    <div className={`flex gap-1.5 ${className ?? ''}`} id={id}>
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
    </div>
  );
}
