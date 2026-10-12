/** Pure parts of ThaiDateInput: B.E. day/month/year strings <-> ISO `yyyy-mm-dd` (A.D.). */
export interface ThaiDateParts { d: string; m: string; yBe: string }

/** Earliest B.E. year accepted — guards against an A.D. year typed by mistake (e.g. 1483 A.D.). */
export const MIN_BE_YEAR = 2500;

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export function pad(value: string) {
  return value.padStart(2, '0');
}

export function parseIsoParts(value?: string | null): ThaiDateParts {
  if (!value) return { d: '', m: '', yBe: '' };
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return { d: '', m: '', yBe: '' };
  return { d: String(Number(d)), m: String(Number(m)), yBe: String(Number(y) + 543) };
}

/** ISO date for complete, valid parts; '' for anything incomplete or invalid. */
export function partsToIso(p: ThaiDateParts): string {
  const d = Number(p.d);
  const m = Number(p.m);
  const yBe = Number(p.yBe);
  if (!p.d || !p.m || p.yBe.length !== 4 || Number.isNaN(yBe) || yBe < MIN_BE_YEAR) return '';
  if (d < 1 || d > 31 || m < 1 || m > 12) return '';
  const ad = yBe - 543;
  if (d > daysInMonth(ad, m)) return ''; // 31 Apr / 30 Feb do not exist — never silently moved to another day
  return `${ad}-${pad(String(m))}-${pad(String(d))}`;
}

/** Every field filled in, yet no valid date comes out. */
export function isInvalidParts(p: ThaiDateParts): boolean {
  return !!p.d && !!p.m && p.yBe.length === 4 && partsToIso(p) === '';
}

/** Something typed, but not yet day + month + a 4-digit year. */
export function isPartialParts(p: ThaiDateParts): boolean {
  const any = !!p.d || !!p.m || !!p.yBe;
  return any && !(p.d && p.m && p.yBe.length === 4);
}
