/**
 * PII masking.
 *
 * Rule of thumb for this codebase: anything that leaves the database — audit
 * metadata, application logs, error strings, exported files, screenshots —
 * must be masked. Records that legitimately need the real value (the contact
 * row itself, the outbound email envelope) are the only exceptions.
 *
 * Masks are deliberately lossy and NOT reversible. They keep just enough to
 * correlate rows during support ("ends 5678", "same j***@e***.com") without
 * carrying the identifier itself.
 */

const EMAIL_RE = /^([^@\s]+)@([^@\s]+)$/;

/** j***h@e***l.com — first/last char of the local part and of the domain label. */
export function maskEmail(value: string | null | undefined): string {
  if (!value) return '';
  const m = EMAIL_RE.exec(value.trim());
  if (!m) return maskGeneric(value);
  const [, local, domain] = m;
  const dot = domain.indexOf('.');
  const label = dot === -1 ? domain : domain.slice(0, dot);
  const tld = dot === -1 ? '' : domain.slice(dot);
  return `${edges(local)}@${edges(label)}${tld}`;
}

/** Keeps the last 4 digits: 081-234-5678 → *******5678 */
export function maskPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

/** Thai national ID / tax ID — keeps the last 4 digits only. */
export function maskNationalId(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 5) return '*'.repeat(digits.length);
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

/** สมชาย ใจดี → ส*** ใ*** — enough to tell two people apart in a log. */
export function maskName(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? part : `${part[0]}***`))
    .join(' ');
}

/** Fallback for values of unknown shape. */
export function maskGeneric(value: string | null | undefined): string {
  if (!value) return '';
  const v = value.trim();
  if (v.length <= 2) return '*'.repeat(v.length);
  return edges(v);
}

function edges(part: string): string {
  if (part.length <= 2) return `${part[0] ?? ''}*`;
  return `${part[0]}***${part[part.length - 1]}`;
}

/** Object keys treated as PII by {@link maskPiiObject}, matched case-insensitively. */
export const PII_KEYS: Record<string, (v: string) => string> = {
  email: maskEmail,
  useremail: maskEmail,
  contactemail: maskEmail,
  to: maskEmail,
  phone: maskPhone,
  phonenumber: maskPhone,
  mobile: maskPhone,
  tel: maskPhone,
  nationalid: maskNationalId,
  taxid: maskNationalId,
  idcard: maskNationalId,
  passport: maskGeneric,
  address: maskGeneric,
  name: maskName,
  fullname: maskName,
  firstname: maskName,
  lastname: maskName,
  contactname: maskName,
};

/** Secret-ish keys are dropped entirely rather than masked. */
const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'linktoken',
  'secret',
  'apikey',
  'authorization',
]);

/**
 * Deep-mask an object before it is written to an audit row or a log line.
 * Unknown keys pass through untouched — this masks identifiers, it is not a
 * substitute for selecting the right columns in the first place.
 */
export function maskPiiObject<T>(input: T, depth = 0): T {
  if (depth > 6 || input == null) return input;
  if (Array.isArray(input)) return input.map((v) => maskPiiObject(v, depth + 1)) as unknown as T;
  if (typeof input !== 'object') return input;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const k = key.toLowerCase();
    if (SECRET_KEYS.has(k)) {
      out[key] = '[redacted]';
    } else if (typeof value === 'string' && PII_KEYS[k]) {
      out[key] = PII_KEYS[k](value);
    } else if (typeof value === 'object') {
      out[key] = maskPiiObject(value, depth + 1);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Patterns used to scrub free-form text (log messages, screenshots). */
export const PII_TEXT_PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /** 0812345678, 081-234-5678, 02-111-2222, +66 81 234 5678 */
  phone: /(?:\+\d{1,3}[\s-]?)?\d(?:[\d\s-]{7,15})\d/g,
  /** Thai national ID, 13 digits, optionally dashed */
  nationalId: /\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/g,
};

/** Mask every email / phone / national ID occurrence inside free-form text. */
export function maskPiiText(text: string): string {
  if (!text) return text;
  return text
    .replace(PII_TEXT_PATTERNS.email, (m) => maskEmail(m))
    .replace(PII_TEXT_PATTERNS.nationalId, (m) => maskNationalId(m))
    .replace(PII_TEXT_PATTERNS.phone, (m) => maskPhone(m));
}
