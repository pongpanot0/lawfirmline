'use client';

import { useEffect } from 'react';
import { thaiValidityMessage } from '@/lib/thai-validity';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const isControl = (t: EventTarget | null): t is Control =>
  t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;

/** Swaps the browser's validation bubble text for Thai on every form. A message the page set itself is left alone. */
export function ThaiValidity() {
  useEffect(() => {
    const onInvalid = (event: Event) => {
      const el = event.target;
      if (!isControl(el) || document.documentElement.lang === 'en') return;
      if (el.validity.customError && !el.dataset.thaiValidity) return;
      el.setCustomValidity('');
      const message = thaiValidityMessage(el as HTMLInputElement);
      if (!message) return;
      el.dataset.thaiValidity = '1';
      el.setCustomValidity(message);
    };
    const onEdit = (event: Event) => {
      const el = event.target;
      if (!isControl(el) || !el.dataset.thaiValidity) return;
      delete el.dataset.thaiValidity;
      el.setCustomValidity('');
    };
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
    };
  }, []);
  return null;
}
