/** Deadline urgency on the Bangkok calendar; a legal deadline is due at 16:30 Bangkok on its day. */
export type UrgencyTone = 'due' | 'court' | 'info' | 'none';
export interface Urgency { tone: UrgencyTone; label: string; daysLeft: number }

const DAY_MS = 86_400_000;
const bangkokKey = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

export function deadlineUrgency(isoDate: string, now: Date): Urgency {
  // An unparseable date must not throw in render; show a neutral, empty urgency.
  if (Number.isNaN(Date.parse(isoDate))) return { tone: 'none', label: '', daysLeft: 0 };
  const due = bangkokKey(Date.parse(isoDate));
  const daysLeft = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${bangkokKey(now.getTime())}T00:00:00Z`)) / DAY_MS);
  if (now.getTime() > Date.parse(`${due}T16:30:00+07:00`)) {
    // ponytail: the design has no copy for "due today, already past 16:30"; this mirrors "ครบกำหนดวันนี้ 16:30 น.".
    return { tone: 'due', daysLeft, label: daysLeft < 0 ? `เลยกำหนด ${-daysLeft} วัน` : 'เลยกำหนดวันนี้ 16:30 น.' };
  }
  if (daysLeft === 0) return { tone: 'due', daysLeft, label: 'ครบกำหนดวันนี้ 16:30 น.' };
  return { tone: daysLeft <= 7 ? 'due' : daysLeft <= 30 ? 'court' : 'info', daysLeft, label: `เหลือ ${daysLeft} วัน` };
}

/**
 * ป.วิ.พ. section behind each platform default rule (packages/shared DEFAULT_DEADLINE_RULES comments).
 * ponytail: suggestions carry no citation field, so this keys on the default label; a firm-renamed rule
 * shows no basis. Move the citation onto the rule row if firms need their own.
 */
const LEGAL_BASIS: Record<string, string> = {
  'ขอให้ส่งหมายเรียกและสำเนาคำฟ้อง': 'ป.วิ.พ. ม.173',
  'ครบกำหนดยื่นคำให้การ': 'ป.วิ.พ. ม.177',
  'ครบกำหนดยื่นคำให้การ (ปิดหมาย)': 'ป.วิ.พ. ม.79 และ ม.177',
  'ตรวจขาดนัดยื่นคำให้การ / ขอให้พิพากษาโดยขาดนัด': 'ป.วิ.พ. ม.197–198',
  'ยื่นบัญชีระบุพยาน': 'ป.วิ.พ. ม.88',
  'ครบกำหนดยื่นอุทธรณ์': 'ป.วิ.พ. ม.229',
  'ครบกำหนดยื่นคำร้องขออนุญาตฎีกาและฎีกา': 'ป.วิ.พ. ม.247',
  'ครบกำหนดยื่นคำแก้อุทธรณ์': 'ป.วิ.พ. ม.237',
  'ใกล้ครบระยะบังคับคดี 10 ปี': 'ป.วิ.พ. ม.274',
};

export function legalBasis(label: string | null | undefined): string | null {
  return label ? LEGAL_BASIS[label] ?? null : null;
}
