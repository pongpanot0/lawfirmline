import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  // Whole baht stay short (฿50,000); any satang always shows two digits (฿350.50, never ฿350.5).
  const fraction = Math.round(amount * 100) % 100 !== 0 ? 2 : 0;
  return `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: fraction, maximumFractionDigits: 2 })}`;
}

/**
 * Court times are Thai wall-clock times, so display never follows the
 * viewer's device zone (see lib/bangkok.ts).
 */
const BANGKOK = 'Asia/Bangkok';

export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions) {
  return new Date(date).toLocaleDateString('th-TH', {
    timeZone: BANGKOK,
    ...(opts ?? { day: 'numeric', month: 'short', year: 'numeric' }),
  });
}

export function formatDateTime(date: string | Date) {
  return new Date(date).toLocaleString('th-TH', {
    timeZone: BANGKOK,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
