import { QuickReplyItem } from '../../line-messaging.service';

const BANGKOK_TZ = 'Asia/Bangkok';

const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 1, 'มกราคม': 1, 'มกรา': 1,
  'ก.พ.': 2, 'กุมภาพันธ์': 2, 'กุมภา': 2,
  'มี.ค.': 3, 'มีนาคม': 3, 'มีนา': 3,
  'เม.ย.': 4, 'เมษายน': 4, 'เมษา': 4,
  'พ.ค.': 5, 'พฤษภาคม': 5, 'พฤษภา': 5,
  'มิ.ย.': 6, 'มิถุนายน': 6, 'มิถุนา': 6,
  'ก.ค.': 7, 'กรกฎาคม': 7, 'กรกฎา': 7,
  'ส.ค.': 8, 'สิงหาคม': 8, 'สิงหา': 8,
  'ก.ย.': 9, 'กันยายน': 9, 'กันยา': 9,
  'ต.ค.': 10, 'ตุลาคม': 10, 'ตุลา': 10,
  'พ.ย.': 11, 'พฤศจิกายน': 11, 'พฤศจิกา': 11,
  'ธ.ค.': 12, 'ธันวาคม': 12, 'ธันวา': 12,
};

export function todayInBangkok(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Buddhist-era and 2-digit years normalised to a 4-digit Gregorian year. */
function normaliseYear(year: number): number {
  if (year < 100) return year >= 50 ? 2500 + year - 543 : 2000 + year;
  if (year > 2400) return year - 543;
  return year;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Round-trip guards against 31 Feb and friends.
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Parse what a Thai user actually types into a date: "วันนี้", "พรุ่งนี้",
 * "2026-09-15", "15/9/2569", "15 ก.ย. 68". Returns YYYY-MM-DD, or null when
 * the text is not a date we are confident about (a bare "15" is rejected on
 * purpose — `new Date('15')` silently means the year 2015).
 */
export function parseFlexibleDate(text: string, now: Date = new Date()): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const today = todayInBangkok(now);

  const relative: Record<string, number> = {
    'วันนี้': 0,
    'พรุ่งนี้': 1,
    'พรุ้งนี้': 1,
    'มะรืน': 2,
    'มะรืนนี้': 2,
    'สัปดาห์หน้า': 7,
    'อาทิตย์หน้า': 7,
  };
  if (raw in relative) return addDays(today, relative[raw]);

  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return toIso(normaliseYear(Number(isoMatch[1])), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dmyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = dmyMatch[3] ? normaliseYear(Number(dmyMatch[3])) : Number(today.slice(0, 4));
    return toIso(year, month, day);
  }

  const thaiMatch = raw.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})?$/);
  if (thaiMatch) {
    const month = THAI_MONTHS[thaiMatch[2]];
    if (!month) return null;
    const year = thaiMatch[3] ? normaliseYear(Number(thaiMatch[3])) : Number(today.slice(0, 4));
    return toIso(year, month, Number(thaiMatch[1]));
  }

  return null;
}

/** Human-readable label for a stored ISO date, e.g. "15 ก.ย. 2026". */
export function formatIsoDate(iso: unknown): string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return String(iso ?? '');
  const [y, m, d] = iso.split('-');
  const month = Object.keys(THAI_MONTHS).find((k) => k.endsWith('.') && THAI_MONTHS[k] === Number(m));
  return `${Number(d)} ${month ?? m} ${y}`;
}

export const DATE_HELP = 'พิมพ์วันที่ได้เลยครับ เช่น "พรุ่งนี้", "15/9/2569" หรือ "2026-09-15"';

export function dateQuickReply(options: { skip?: boolean } = {}): QuickReplyItem[] {
  const items: QuickReplyItem[] = [
    { label: 'วันนี้', text: 'วันนี้' },
    { label: 'พรุ่งนี้', text: 'พรุ่งนี้' },
    { label: 'สัปดาห์หน้า', text: 'สัปดาห์หน้า' },
  ];
  if (options.skip !== false) items.push({ label: 'ข้าม (ไม่มีกำหนด)', text: 'ข้าม' });
  items.push({ label: '❌ ยกเลิก', text: 'ยกเลิก' });
  return items;
}
