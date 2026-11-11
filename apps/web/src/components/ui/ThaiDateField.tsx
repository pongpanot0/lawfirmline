'use client';

import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { thaiDateLabel } from '@/lib/thai-date';

export { thaiDateLabel };

/**
 * One field that always reads like the mockups ("24 พ.ย. 2569") and opens the
 * native date picker. The real <input> sits on top, transparent, so taps, keyboard
 * entry and screen readers all reach the platform control.
 */
export function ThaiDateField({ id, value, onChange, withTime = false, required, disabled, placeholder = 'เลือกวัน', className = '', ariaLabel, describedBy, invalid }: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const label = thaiDateLabel(value, withTime);
  return <div className={`relative mt-1 flex min-h-[46px] w-full items-center justify-between gap-2 rounded-lg border bg-white px-[.8rem] py-[.55rem] text-base focus-within:ring-2 focus-within:ring-ring sm:text-[15px] ${invalid ? 'border-2 border-[#a83232] bg-[#fffafa]' : 'border-[#c9ccc6]'} ${disabled ? 'opacity-60' : ''} ${className}`}>
    <span aria-hidden="true" className={label ? '' : 'text-muted-foreground'}>{label || placeholder}</span>
    <CalendarDays aria-hidden="true" className="h-[1.1em] w-[1.1em] shrink-0 text-muted-foreground" />
    <input
      ref={input}
      id={id}
      type={withTime ? 'datetime-local' : 'date'}
      value={value}
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* picker opens natively */ } }}
      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
    />
  </div>;
}
