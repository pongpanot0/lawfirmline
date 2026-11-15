/** Fee subtotals are before discount; VAT uses the proportional discount on fees only. */
export function computeInvoiceTotals(
  lines: { amount: number; taxClass: 'LITIGATION_EXEMPT' | 'ADVISORY_VAT' | 'DISBURSEMENT' }[],
  discount: number,
  vatRegistered: boolean,
  vatRate: number,
): { exempt: number; taxable: number; vat: number; disbursement: number; total: number } {
  const round2 = (amount: number) => Math.round(amount * 100) / 100;
  const exempt = round2(lines.filter(l => l.taxClass === 'LITIGATION_EXEMPT').reduce((sum, l) => sum + l.amount, 0));
  const taxable = round2(lines.filter(l => l.taxClass === 'ADVISORY_VAT').reduce((sum, l) => sum + l.amount, 0));
  const disbursement = round2(lines.filter(l => l.taxClass === 'DISBURSEMENT').reduce((sum, l) => sum + l.amount, 0));
  const fees = exempt + taxable;
  const vat = vatRegistered && fees > 0 ? round2(vatRate * taxable * (1 - discount / fees)) : 0;
  return { exempt, taxable, vat, disbursement, total: round2(fees - discount + vat + disbursement) };
}

/** WHT the payer is expected to withhold on this payment: rate × the fee base (lines other than disbursements, after discount),
 * pro-rated by how much of the invoice the payment settles. */
export function suggestWht(rate: number, feeBase: number, amount: number, wht: number, outstanding: number, invoiceTotal: number): number {
  return invoiceTotal > 0 ? Math.round(rate * feeBase * Math.min(amount + wht, outstanding) / invoiceTotal * 100) / 100 : 0;
}
