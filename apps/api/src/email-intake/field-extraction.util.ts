/**
 * Heuristic field extraction over raw email text.
 *
 * Stands in for a real AI/NLP extraction step so the intake flow can be built,
 * tested, and demoed end to end before an LLM or Microsoft Graph connector is
 * wired up. Every value it proposes must still go through lawyer confirmation
 * (see EmailIntakeService) — it never writes a field on its own, and it never
 * invents a value it cannot find text for.
 */

export interface ExtractedField {
  field: string;
  value: string;
  sourceDetail: string;
}

const AMOUNT_PATTERN = /(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*บาท/;
const RELATIVE_DEADLINE_PATTERN = /ภายใน\s*(\d{1,3})\s*วัน/;
const ABSOLUTE_DATE_PATTERN = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;
const OPPOSING_PARTY_PATTERN = /(?:คู่กรณี|จำเลย|ฝ่ายตรงข้าม)[:\s]+([^\n,]{2,60}?)(?=\s+(?:กรุณา|ขอบคุณ)|[.\n]|$)/;

export function extractFieldsFromEmailBody(bodyText: string): ExtractedField[] {
  const results: ExtractedField[] = [];
  if (!bodyText) return results;

  const amountMatch = bodyText.match(AMOUNT_PATTERN);
  if (amountMatch) {
    const numeric = Number(amountMatch[1].replace(/,/g, ''));
    if (!Number.isNaN(numeric)) {
      results.push({
        field: 'estimatedDamage',
        value: String(numeric),
        sourceDetail: `พบข้อความ "${amountMatch[0]}" ในเนื้อหาอีเมล`,
      });
    }
  }

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
