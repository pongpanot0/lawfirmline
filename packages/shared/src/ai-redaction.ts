/**
 * Redaction for text that leaves the firm for a third-party model.
 *
 * This is NOT {@link maskPiiText}. That one guards logs and audit rows, where
 * losing a date costs nothing, so it masks any long run of digits. Applied to
 * case facts it destroys the very things the analysis turns on — an incident
 * date becomes `****0907`, and the limitation period can no longer be read —
 * while still letting a hospital number through.
 *
 * Here the balance is the opposite: remove the identifiers that make a person
 * findable, and leave every fact a lawyer reasons with (dates, money, case
 * numbers, statute sections) exactly as written. Identifiers become a typed
 * placeholder rather than a mask, so the model can see that a value was there
 * and what kind it was, while none of it leaves the firm.
 */

export const REDACTION_PLACEHOLDERS = {
  nationalId: '[เลขประจำตัวประชาชน]',
  phone: '[เบอร์โทร]',
  email: '[อีเมล]',
  hospitalNumber: '[เลขเวชระเบียน]',
  passport: '[เลขหนังสือเดินทาง]',
} as const;

export type RedactionKind = keyof typeof REDACTION_PLACEHOLDERS;

/** What a single pass removed, kept for the audit trail. */
export type RedactionCounts = Partial<Record<RedactionKind, number>>;

export interface RedactionResult {
  text: string;
  counts: RedactionCounts;
  /** True when anything at all was removed. */
  redacted: boolean;
}

/**
 * Order matters: a labelled hospital number is claimed before the bare-digit
 * rules can take it, and email before anything that could bite into its digits.
 */
const RULES: Array<{ kind: RedactionKind; pattern: RegExp }> = [
  {
    kind: 'email',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    // Anchored to its label, because a bare 6-9 digit run is far more often a
    // case number, an amount or a year than a medical record number.
    kind: 'hospitalNumber',
    pattern:
      /(?:\b(?:HN|AN)\b|เลขที่ผู้ป่วย|เลขเวชระเบียน|เลขที่เวชระเบียน)[\s:.]*[A-Za-z]?[\d-]{4,15}/gi,
  },
  {
    kind: 'nationalId',
    // 13 digits, optionally separated, not glued to a longer number.
    pattern: /(?<![\d-])\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d(?![\d-])/g,
  },
  {
    kind: 'phone',
    // Thai numbers only: 0X..., +66..., 66.... A date or an amount never starts
    // this way, which is what keeps 2026-09-07 intact.
    pattern: /(?<![\d-])(?:\+?66[\s-]?|0)\d(?:[\s-]?\d){7,8}(?![\d-])/g,
  },
  {
    kind: 'passport',
    pattern: /(?<![A-Za-z0-9])[A-Z]{1,2}\d{6,7}(?![A-Za-z0-9])/g,
  },
];

/**
 * Dates, times and formatted amounts are lifted out before the identifier
 * rules run and put back afterwards. Without this, `12/03/2568` and
 * `2026-09-07` read as long digit runs and get eaten.
 */
const PRESERVED = [
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?Z?)?\b/g, // 2026-09-07, with time
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, // 12/03/2568
  /\b\d{1,2}:\d{2}(?::\d{2})?\b/g, // 09:30
  /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, // 1,500,000
];

/**
 * A token no identifier rule can match: it has no digit run of its own, so a
 * preserved date cannot be re-broken while it is parked.
 */
const KEEP_OPEN = '␂KEEP';
const KEEP_CLOSE = '␃';

export function redactForAi(input: string | null | undefined): RedactionResult {
  if (!input) return { text: input ?? '', counts: {}, redacted: false };

  const kept: string[] = [];
  let text = input;
  for (const pattern of PRESERVED) {
    text = text.replace(pattern, (match) => {
      kept.push(match);
      return `${KEEP_OPEN}${toLetters(kept.length - 1)}${KEEP_CLOSE}`;
    });
  }

  const counts: RedactionCounts = {};
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match) => {
      counts[rule.kind] = (counts[rule.kind] ?? 0) + 1;
      return REDACTION_PLACEHOLDERS[rule.kind];
    });
  }

  text = text.replace(
    new RegExp(`${KEEP_OPEN}([a-z]+)${KEEP_CLOSE}`, 'g'),
    (_, letters: string) => kept[fromLetters(letters)],
  );

  return { text, counts, redacted: Object.keys(counts).length > 0 };
}

/** Index as letters, so the parked marker carries no digits of its own. */
function toLetters(index: number): string {
  return String(index)
    .split('')
    .map((d) => String.fromCharCode(97 + Number(d)))
    .join('');
}

function fromLetters(letters: string): number {
  return Number(
    letters
      .split('')
      .map((c) => c.charCodeAt(0) - 97)
      .join(''),
  );
}
