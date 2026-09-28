'use client';

import { useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { formatMoneyInput, normalizeMoneyInput } from '@/lib/money-input';

type Props = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> & {
  value: string | number;
  onValueChange: (value: string) => void;
  min?: number;
  max?: number;
};

export function MoneyInput({ value, onValueChange, min, max, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null || !ref.current) return;
    const shown = ref.current.value;
    let position = 0;
    let rawChars = 0;
    while (position < shown.length && rawChars < caret.current) {
      if (shown[position] !== ',') rawChars++;
      position++;
    }
    while (shown[position] === ',') position++;
    ref.current.setSelectionRange(position, position);
    caret.current = null;
  }, [value]);
  useEffect(() => {
    const amount = Number(value);
    const invalid = String(value) !== '' && ((min !== undefined && amount < min) || (max !== undefined && amount > max));
    ref.current?.setCustomValidity(invalid ? `จำนวนเงินต้องอยู่ระหว่าง ${formatMoneyInput(min ?? 0)} และ ${formatMoneyInput(max ?? 100000000)} บาท` : '');
  }, [value, min, max]);

  return <Input {...props} ref={ref} type="text" inputMode="decimal" value={formatMoneyInput(value)}
    onChange={(event) => {
      const raw = normalizeMoneyInput(event.target.value);
      if (raw !== null) {
        caret.current = event.target.value.slice(0, event.target.selectionStart ?? 0).replace(/[,\s฿]/g, '').length;
        onValueChange(raw);
      }
    }} />;
}
