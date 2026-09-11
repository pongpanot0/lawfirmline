import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return `฿${amount.toLocaleString('th-TH')}`;
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
