import { InvoicePayment } from '../generated/prisma';

export function settledAmount(payments: Pick<InvoicePayment, 'amount' | 'whtAmount' | 'clearedAt'>[]): number {
  return Math.round(payments.reduce((sum, p) => sum + (p.clearedAt != null ? p.amount + p.whtAmount : 0), 0) * 100) / 100;
}
