import type { Prisma } from '../generated/prisma';

/**
 * Exact-rule matching of an external name (Outlook folder, OneDrive folder,
 * email subject) to cases — no AI. Callers only ever SHOW these suggestions;
 * a person confirms every link (spec ส่วน B / D).
 */
export interface MatchableCase {
  id: string;
  ownRef: string;
  title: string;
  clientName: string | null;
  caseNumbers: string[];
}

export type CaseMatchReason = 'OWN_REF' | 'CASE_NUMBER' | 'CLIENT_NAME';

export interface CaseMatchSuggestion {
  caseId: string;
  ownRef: string;
  title: string;
  reason: CaseMatchReason;
  matchedText: string;
}

const REASON_RANK: Record<CaseMatchReason, number> = { OWN_REF: 0, CASE_NUMBER: 1, CLIENT_NAME: 2 };
const MIN_TOKEN = 3;
const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_WORD_AFTER = '(?![\\p{L}\\p{N}])';
/** "ผบ.1234/2567" → 1234 / 2567. Thai numerals are not handled (case numbers are stored with ASCII digits). */
const CASE_NUMBER_CORE = /(\d+)\s*\/\s*(\d{2,4})/;
/**
 * Longest alternatives first (นางสาว before นาง, (มหาชน) before มหาชน). Latin affixes need a word
 * boundary so "Zinc" / "Princeton" keep their letters. Stripped only at the start/end of a name.
 */
const AFFIX_SRC =
  '(?:บริษัท|บจก\\.?|บมจ\\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|หจก\\.?|\\(มหาชน\\)|มหาชน|จำกัด|นางสาว|นาง|นาย|' +
  '(?<![a-z])(?:co\\.?,?\\s*ltd\\.?|company|limited|ltd\\.?|inc\\.?)(?![a-z]))';
const LEADING_AFFIX = new RegExp(`^\\s*${AFFIX_SRC}\\s*`, 'iu');
const TRAILING_AFFIX = new RegExp(`\\s*${AFFIX_SRC}\\s*$`, 'iu');
const MIN_NON_ASCII_NAME = 4;

export const MATCHABLE_CASE_SELECT = {
  id: true,
  ownRef: true,
  title: true,
  clientName: true,
  blackCaseNumber: true,
  redCaseNumber: true,
  client: { select: { name: true } },
  proceedings: { select: { blackCaseNumber: true, redCaseNumber: true } },
} satisfies Prisma.CaseSelect;

export type MatchableCaseRow = Prisma.CaseGetPayload<{ select: typeof MATCHABLE_CASE_SELECT }>;

export function toMatchableCase(row: MatchableCaseRow): MatchableCase {
  const numbers = [
    row.blackCaseNumber,
    row.redCaseNumber,
    ...row.proceedings.flatMap((p) => [p.blackCaseNumber, p.redCaseNumber]),
  ]
    .map((n) => n?.trim() ?? '')
    .filter((n) => n.length > 0);
  return {
    id: row.id,
    ownRef: row.ownRef,
    title: row.title,
    clientName: row.client?.name ?? row.clientName,
    caseNumbers: [...new Set(numbers)],
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasOwnRef(name: string, ownRef: string): boolean {
  const ref = ownRef.trim();
  if ([...ref].length < MIN_TOKEN) return false;
  return new RegExp(`${NOT_WORD_BEFORE}${escapeRegex(ref)}${NOT_WORD_AFTER}`, 'iu').test(name);
}

function hasCaseNumber(name: string, caseNumber: string): boolean {
  const core = CASE_NUMBER_CORE.exec(caseNumber);
  if (!core) return false;
  // "/" only. Not glued to a letter ("Q5/2568"), not the tail of a date ("15/5/2568"),
  // not followed by more digits or a further "/n" ("5/2568/1").
  return new RegExp(
    `(?<![\\p{L}\\d])(?<!\\d+[/.\\-])${core[1]}/${core[2]}(?!\\d)(?!/\\d)`,
    'u',
  ).test(name);
}

function stripAffixes(value: string): string {
  let current = value.normalize('NFC').trim();
  for (;;) {
    const next = current.replace(LEADING_AFFIX, '').replace(TRAILING_AFFIX, '').trim();
    if (next === current) return current;
    current = next;
  }
}

function hasClientName(name: string, clientName: string | null): boolean {
  if (!clientName) return false;
  const core = stripAffixes(clientName).replace(/\s+/g, ' ').toLowerCase();
  const folder = name.replace(/\s+/g, ' ').toLowerCase();
  if (/^[\x00-\x7f]*$/.test(core)) {
    // ASCII names have word breaks: require a non-alphanumeric boundary ("ABC" must not hit "Fabcdef").
    if ([...core].length < MIN_TOKEN) return false;
    return new RegExp(`(?<![a-z0-9])${escapeRegex(core)}(?![a-z0-9])`).test(folder);
  }
  // Thai names have no word breaks: whitespace-stripped substring test, the weakest signal, ranked last.
  const visible = [...core.replace(/\s+/g, '')].filter((c) => !/\p{M}/u.test(c));
  return visible.length >= MIN_NON_ASCII_NAME && folder.replace(/\s+/g, '').includes(core.replace(/\s+/g, ''));
}

export function suggestCaseMatches(folderName: string, cases: MatchableCase[]): CaseMatchSuggestion[] {
  const name = folderName.normalize('NFC').trim();
  if (!name) return [];

  const suggestions: CaseMatchSuggestion[] = [];
  for (const candidate of cases) {
    const base = { caseId: candidate.id, ownRef: candidate.ownRef, title: candidate.title };
    if (hasOwnRef(name, candidate.ownRef)) {
      suggestions.push({ ...base, reason: 'OWN_REF', matchedText: candidate.ownRef });
      continue;
    }
    const caseNumber = candidate.caseNumbers.find((n) => hasCaseNumber(name, n));
    if (caseNumber) {
      suggestions.push({ ...base, reason: 'CASE_NUMBER', matchedText: caseNumber });
      continue;
    }
    if (candidate.clientName && hasClientName(name, candidate.clientName)) {
      suggestions.push({ ...base, reason: 'CLIENT_NAME', matchedText: candidate.clientName });
    }
  }
  return suggestions.sort(
    (a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || a.ownRef.localeCompare(b.ownRef),
  );
}
