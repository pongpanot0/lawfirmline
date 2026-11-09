/**
 * Heuristic field extraction over raw email text.
 *
 * Stands in for a real AI/NLP extraction step so the intake flow can be built,
 * tested, and demoed end to end before an LLM or Microsoft Graph connector is
 * wired up. Every value it proposes must still go through lawyer confirmation
 * (see EmailIntakeService) — it never writes a field on its own, and it never
 * invents a value it cannot find text for.
 */

import { splitQuotedText, stripEmailSignature } from '@lawfirm/shared';

export interface ExtractedField {
  field: string;
  value: string;
  sourceDetail: string;
}

const AMOUNT_PATTERN = /((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*บาท/g;
// How far back from an amount to look for what it is — roughly one clause.
const AMOUNT_CONTEXT_CHARS = 80;
const MAX_AMOUNTS = 10;

/**
 * What a baht amount is, read from the words just before it. Insurer first: "ประกันจ่ายค่าเสียหาย"
 * is money paid, not money claimed. Other amounts keep their label for confirmation.
 */
function classifyAmount(clause: string): string | null {
  // "ยังไม่มีการจ่ายจากประกัน" is the opposite of insurer-paid.
  if (/ประกัน/.test(clause) && /จ่าย|ชดใช้|ชำระ|โอน/.test(clause) && !/ยังไม่|ไม่มีการ|ไม่ได้/.test(clause)) return 'insurerPaidAmount';
  if (/ไกล่เกลี่ย|ข้อเสนอ/.test(clause)) return 'settlementOfferAmount';
  if (/เรียกร้อง|ฟ้อง|ทุนทรัพย์|ค่าเสียหาย|ค่าสินไหม/.test(clause)) return 'estimatedDamage';
  if (/^ค่า|ค้างชำระ|ค้างจ่าย/.test(clause)) return 'otherAmount';
  return null;
}

/**
 * The words nearest the amount decide what it is: grow the clause one Thai word-group at a time
 * from the amount backwards, so "…ยังไม่มีการจ่ายจากประกัน ค่ารักษาค้างชำระ 82,400" is the
 * outstanding bill, not money the insurer paid.
 */
function amountField(context: string): { field: string; label: string } {
  const parts = context.trim().split(/\s+/).filter(Boolean);
  for (let n = 1; n <= parts.length; n++) {
    const clause = parts.slice(-n).join(' ');
    const field = classifyAmount(clause);
    if (field) return { field, label: clause };
  }
  return { field: 'otherAmount', label: parts[parts.length - 1] ?? '' };
}

function extractAmounts(text: string): ExtractedField[] {
  const results: ExtractedField[] = [];
  let previousAmountEnd = 0;
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    if (results.length >= MAX_AMOUNTS) break;
    const numeric = Number(match[1].replace(/,/g, ''));
    if (Number.isNaN(numeric)) continue;
    const start = match.index ?? 0;
    // The clause before the amount, cut at the previous line break so a heading above doesn't leak in.
    const before = text.slice(Math.max(previousAmountEnd, start - AMOUNT_CONTEXT_CHARS), start);
    const context = before.slice(before.lastIndexOf('\n') + 1);
    previousAmountEnd = start + match[0].length;
    const quote = `${context}${match[0]}`.replace(/\s+/g, ' ').trim();
    const { field, label } = amountField(context);
    results.push({ field, value: field === 'otherAmount' ? JSON.stringify({ label: label || 'ยอดเงินอื่น', amount: numeric }) : String(numeric), sourceDetail: `พบข้อความ "${quote}" ในเนื้อหาอีเมล` });
  }
  return results;
}
const RELATIVE_DEADLINE_PATTERN = /ภายใน\s*(\d{1,3})\s*วัน/;
const ABSOLUTE_DATE_PATTERN = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;
const OPPOSING_PARTY_PATTERN = /(?:คู่กรณี|จำเลย|ฝ่ายตรงข้าม)[:\s]+([^\n,]{2,60}?)(?=\s+(?:กรุณา|ขอบคุณ)|[.\n]|$)/;

/**
 * Reads only the new part of the message — the quoted history below "From: … Sent: …" is an
 * older message of the thread and gets its own pass, so its values carry the right source.
 */
export function extractFieldsFromEmailBody(rawBody: string): ExtractedField[] {
  const bodyText = stripEmailSignature(splitQuotedText(rawBody ?? '').main);
  const results: ExtractedField[] = [];
  if (!bodyText) return results;

  results.push(...extractAmounts(bodyText));

  const absoluteDate = bodyText.match(ABSOLUTE_DATE_PATTERN);
  if (absoluteDate) {
    const [, day, month, year] = absoluteDate;
    const date = parseIntakeDate(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (date) results.push({
      field: 'requestedResponseDate',
      value: date.toISOString(),
      sourceDetail: `พบวันที่ "${absoluteDate[0]}" ในเนื้อหาอีเมล`,
    });
  } else {
    const relativeDeadline = bodyText.match(RELATIVE_DEADLINE_PATTERN);
    if (relativeDeadline) {
      const days = Number(relativeDeadline[1]);
      const target = new Date();
      target.setDate(target.getDate() + days);
      results.push({
        field: 'requestedResponseDate',
        value: target.toISOString(),
        sourceDetail: `พบข้อความ "${relativeDeadline[0]}" ในเนื้อหาอีเมล — คำนวณจากวันที่รับเมล`,
      });
    }
  }

  const opposingParty = bodyText.match(OPPOSING_PARTY_PATTERN);
  if (opposingParty) {
    results.push({
      field: 'opposingParty',
      value: opposingParty[1].trim(),
      sourceDetail: `พบข้อความ "${opposingParty[0].trim()}" ในเนื้อหาอีเมล`,
    });
  }

  results.push({
    field: 'description',
    value: bodyText.trim().slice(0, 2000),
    sourceDetail: 'สรุปจากเนื้อหาอีเมลทั้งหมด — ทนายควรอ่านต้นฉบับก่อนยืนยัน',
  });

  return results;
}

/** Validate calendar dates instead of silently rolling e.g. 31 February into March. */
export function parseIntakeDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]) >= 2400 ? Number(match[1]) - 543 : Number(match[1]);
  const month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
