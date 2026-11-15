export type TaxClass = 'LITIGATION_EXEMPT' | 'ADVISORY_VAT' | 'DISBURSEMENT';
export type ComposerLine = { key: string; source: 'time' | 'expense' | 'manual' | 'milestone'; id?: string; description: string; amount: number; taxClass: TaxClass };
export function addWork(lines: ComposerLine[], work: ComposerLine[]): ComposerLine[] {
  const keys = new Set(lines.map(line => line.key));
  return [...lines, ...work.filter(line => !keys.has(line.key))];
}
export function reorder(lines: ComposerLine[], from: number, to: number): ComposerLine[] {
  if (from < 0 || to < 0 || from >= lines.length || to >= lines.length) return lines;
  const result = [...lines]; const [line] = result.splice(from, 1); result.splice(to, 0, line); return result;
}
export function groupLines(lines: ComposerLine[]) {
  return { fees: lines.filter(line => line.taxClass !== 'DISBURSEMENT'), disbursements: lines.filter(line => line.taxClass === 'DISBURSEMENT') };
}
export function buildInvoiceLines(lines: ComposerLine[]) {
  const ordered = [...groupLines(lines).fees, ...groupLines(lines).disbursements];
  return {
    milestoneLines: ordered.flatMap((line, sortOrder) => line.source === 'milestone' ? [{ id: line.id!, description: line.description.trim(), sortOrder }] : []),
    timeEntryLines: ordered.flatMap((line, sortOrder) => line.source === 'time' ? [{ id: line.id!, description: line.description.trim(), taxClass: line.taxClass, sortOrder }] : []),
    expenseLines: ordered.flatMap((line, sortOrder) => line.source === 'expense' ? [{ id: line.id!, description: line.description.trim(), taxClass: line.taxClass, sortOrder }] : []),
    lineItems: ordered.flatMap((line, sortOrder) => line.source === 'manual' ? [{ description: line.description.trim(), quantity: 1, unitPrice: line.amount, taxClass: line.taxClass, sortOrder }] : []),
  };
}
