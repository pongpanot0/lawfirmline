export const CASE_COSTS_KEY = '__costEstimate';
export interface CaseCostLine {
  label: string;
  quantity: string;
  rate: string;
}
export const initialCaseCosts = (): CaseCostLine[] => [
  { label: 'ค่าบริการคดี', quantity: '1', rate: '' },
  { label: 'ค่าไปศาล (ต่อครั้ง)', quantity: '1', rate: '' },
  { label: 'ค่าเดินทาง / ที่พัก', quantity: '1', rate: '' },
];
export function readCaseCosts(raw: unknown): CaseCostLine[] {
  if (typeof raw !== 'string') return initialCaseCosts();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 20) return initialCaseCosts();
    return parsed.filter(
      (item): item is CaseCostLine =>
        item &&
        typeof item.label === 'string' &&
        typeof item.quantity === 'string' &&
        typeof item.rate === 'string',
    );
  } catch {
    return initialCaseCosts();
  }
}
export function caseCostTotal(lines: CaseCostLine[]) {
  const amounts = lines.map((line) => {
    if (!/^\d{1,4}$/.test(line.quantity) || Number(line.quantity) > 1000)
      return null;
    if (Number(line.quantity) === 0) return 0;
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(line.rate)) return null;
    const [baht, fraction = ''] = line.rate.split('.');
    const cents = Number(baht) * 100 + Number(fraction.padEnd(2, '0'));
    return cents * Number(line.quantity);
  });
  return {
    amounts,
    totalCents: amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0),
    incomplete: amounts.some((amount) => amount === null),
  };
}
