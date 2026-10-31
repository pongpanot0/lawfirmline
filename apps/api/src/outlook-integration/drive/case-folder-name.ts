import { CASE_NUMBER_REGEX, CaseOutcome, CourtLevel } from '@lawfirm/shared';

/**
 * Pre-fill for "สร้างคดีจาก folder": reads what a person typed into a case folder name, e.g.
 * `89. คำให้การ - พ264.69 - ศ.แพ่ง - แฟมมิลี่ & เมเจอร์ (โบ, พี่ปิง)`. Fixed rules, no AI — every
 * field is only a suggestion the importer can edit before anything is created.
 */
export interface ParsedCaseFolder {
  title: string;
  /** Normalised to `prefix เลข/ปี` and valid for the case form, else null. */
  blackCaseNumber: string | null;
  /** First case-number-looking text, as written — shown when it could not be normalised. */
  caseNumberRaw: string | null;
  /** As written, e.g. `ศ.แพ่งใต้`. */
  courtName: string | null;
  courtLevel: CourtLevel;
  closed: boolean;
  outcome: CaseOutcome | null;
  /** Text of the trailing `(...)`, usually the team's nicknames — a hint only. */
  teamHint: string | null;
}

const LEADING_INDEX = /^\s*(?:\d{1,3}|[A-Za-z])\.\s*/;
// A Thai prefix is required so dates like `(2-6-66)` are never read as case numbers.
const CASE_NUMBER_CANDIDATE = /[ก-ฮ]{1,3}E?\.?\s*\d[\d,\s.\-/]*\d/gu;
const CASE_NUMBER_PARTS = /^([ก-ฮ]{1,3}E?)\.?\s*(\d{1,6})\s*[.\-/]\s*(\d{2}|\d{4})$/u;
const COURT = /(?:ศาล|ศ[ก-ฮ]{0,2}\.)[^\s\-()]+/u;
const TRAILING_PARENS = /\(([^()]*)\)\s*$/;

function normaliseCaseNumber(raw: string): string | null {
  const parts = CASE_NUMBER_PARTS.exec(raw);
  if (!parts) return null;
  const [, prefix, number, year] = parts;
  const value = `${prefix}${number}/${year.length === 2 ? `25${year}` : year}`;
  return CASE_NUMBER_REGEX.test(value) ? value : null;
}

export function parseCaseFolderName(name: string): ParsedCaseFolder {
  const text = name.normalize('NFC').trim();
  const candidates = [...new Set(text.match(CASE_NUMBER_CANDIDATE) ?? [])];
  const withdrawn = text.includes('ถอนฟ้อง');
  return {
    title: text.replace(LEADING_INDEX, '').trim() || text,
    blackCaseNumber: candidates.length === 1 ? normaliseCaseNumber(candidates[0]) : null,
    caseNumberRaw: candidates[0] ?? null,
    courtName: COURT.exec(text)?.[0] ?? null,
    courtLevel: text.includes('ฎีกา') ? CourtLevel.SUPREME : text.includes('อุทธรณ์') ? CourtLevel.APPEAL : CourtLevel.TRIAL,
    closed: withdrawn || /close/i.test(text),
    outcome: withdrawn ? CaseOutcome.WITHDRAWN : null,
    teamHint: TRAILING_PARENS.exec(text)?.[1].trim() || null,
  };
}
