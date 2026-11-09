/**
 * Heuristic field extraction over raw email text.
 *
 * Stands in for a real AI/NLP extraction step so the intake flow can be built,
 * tested, and demoed end to end before an LLM or Microsoft Graph connector is
 * wired up. Every value it proposes must still go through lawyer confirmation
 * (see EmailIntakeService) — it never writes a field on its own, and it never
 * invents a value it cannot find text for.
 */

import { splitQuotedText } from '@lawfirm/shared';

export interface ExtractedField {
  field: string;
  value: string;
  sourceDetail: string;
}

const AMOUNT_PATTERN = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*บาท/g;
// How far back from an amount to look for what it is — roughly one clause.
const AMOUNT_CONTEXT_CHARS = 80;
const MAX_AMOUNTS = 10;

/**
 * What a baht amount is, read from the words just before it. Insurer first: "ประกันจ่ายค่าเสียหาย"
 * is money paid, not money claimed. Anything unrecognised stays display-only (`otherAmount`).
 */
function amountField(context: string): string {
  if (/ประกัน/.test(context) && /จ่าย|ชดใช้|ชำระ|โอน/.test(context)) return 'insurerPaidAmount';
  if (/เรียกร้อง|ฟ้อง|ทุนทรัพย์|ค่าเสียหาย|ค่าสินไหม/.test(context)) return 'estimatedDamage';
  return 'otherAmount';
}

function extractAmounts(text: string): ExtractedField[] {
  const results: ExtractedField[] = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    if (results.length >= MAX_AMOUNTS) break;
    const numeric = Number(match[1].replace(/,/g, ''));
    if (Number.isNaN(numeric)) continue;
    const start = match.index ?? 0;
    // The clause before the amount, cut at the previous line break so a heading above doesn't leak in.
    const before = text.slice(Math.max(0, start - AMOUNT_CONTEXT_CHARS), start);
    const context = before.slice(before.lastIndexOf('\n') + 1);
    const quote = `${context}${match[0]}`.replace(/\s+/g, ' ').trim();
    results.push({ field: amountField(context), value: String(numeric), sourceDetail: `พบข้อความ "${quote}" ในเนื้อหาอีเมล` });
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
  const bodyText = splitQuotedText(rawBody ?? '').main;
  const results: ExtractedField[] = [];
  if (!bodyText) return results;

  results.push(...extractAmounts(bodyText));

  const absoluteDate = bodyText.match(ABSOLUTE_DATE_PATTERN);
  if (absoluteDate) {
    const [, day, month, year] = absoluteDate;
    const y = year.length === 4 ? Number(year) : Number(year) + 2500 - 543;
    const iso = new Date(Date.UTC(y, Number(month) - 1, Number(day))).toISOString();
    results.push({
      field: 'requestedResponseDate',
      value: iso,
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
