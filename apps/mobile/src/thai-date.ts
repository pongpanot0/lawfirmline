/**
 * Typed Thai dates: วัน / เดือน / ปี พ.ศ. parts <-> a Bangkok calendar day `YYYY-MM-DD` (ค.ศ.).
 * Same rule as the web ThaiDateInput: all three parts or none, and an impossible day
 * (31 เม.ย.) is rejected, never moved to another day.
 */
export interface ThaiDateParts { d: string; m: string; y: string }

export type ThaiDateCheck =
  | { kind: 'empty' }
  | { kind: 'partial'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'ok'; day: string };

export const THAI_DATE_PARTIAL = 'กรอกให้ครบทั้งวัน เดือน ปี หรือเว้นว่างทั้งหมด';
export const THAI_DATE_IMPOSSIBLE = 'วันที่นี้ไม่มีในปฏิทิน';
export const THAI_DATE_YEAR = 'ใส่ปี พ.ศ. (เช่น 2569)';
const MIN_BE_YEAR = 2400;
const MAX_BE_YEAR = 2700;

export const THAI_MONTH_OPTIONS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
].map((label, index) => ({ value: String(index + 1), label }));

export function checkThaiDate(parts: ThaiDateParts): ThaiDateCheck {
  const d = parts.d.trim();
  const m = parts.m.trim();
  const y = parts.y.trim();
  if (!d && !m && !y) return { kind: 'empty' };
  if (!d || !m || y.length !== 4) return { kind: 'partial', message: THAI_DATE_PARTIAL };
  const be = Number(y);
  if (!/^\d{4}$/.test(y) || be < MIN_BE_YEAR || be > MAX_BE_YEAR) return { kind: 'invalid', message: THAI_DATE_YEAR };
  const day = Number(d);
  const month = Number(m);
  const ad = be - 543;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || month < 1 || month > 12 || day < 1
    || day > new Date(Date.UTC(ad, month, 0)).getUTCDate()) {
    return { kind: 'invalid', message: THAI_DATE_IMPOSSIBLE };
  }
  return { kind: 'ok', day: `${ad}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

export function dayToParts(day: string | null | undefined): ThaiDateParts {
  const match = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { d: '', m: '', y: '' };
  return { d: String(Number(match[3])), m: String(Number(match[2])), y: String(Number(match[1]) + 543) };
}

/** Bangkok midnight of a whole day as an ISO instant — how the API stores a limitation or event day. */
export function bangkokDayToIso(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

/**
 * The API re-syncs (and resets) the limitation reminder whenever the key is present,
 * so send it only when it changed, and null only for an explicit clear.
 */
export function limitationPatch(formDay: string | null, storedDay: string | null): { limitationDeadline?: string | null } {
  if (formDay === storedDay) return {};
  return { limitationDeadline: formDay ? bangkokDayToIso(formDay) : null };
}

export type ThaiDateAction =
  | { emit: 'day'; day: string; invalid: false }
  | { emit: 'clear'; invalid: false }
  | { emit: 'confirm-clear'; invalid: false }
  | { emit: 'none'; invalid: true; message: string };

/**
 * What the field does with newly typed parts. A half-typed or impossible entry never reaches the
 * form (`none`), so it can never overwrite or clear a saved date; emptying a saved date asks first.
 */
export function thaiDateAction(next: ThaiDateParts, value: string | null, confirmClear: boolean): ThaiDateAction {
  const result = checkThaiDate(next);
  if (result.kind === 'ok') return { emit: 'day', day: result.day, invalid: false };
  if (result.kind === 'empty') return value && confirmClear ? { emit: 'confirm-clear', invalid: false } : { emit: 'clear', invalid: false };
  return { emit: 'none', invalid: true, message: result.message };
}
