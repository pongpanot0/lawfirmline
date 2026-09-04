/**
 * Shared validation rules for numeric / formatted text fields.
 *
 * The `*_HTML` variants are the same rule expressed for the `pattern` attribute
 * (which is implicitly anchored), so the browser blocks bad input before submit
 * and the API rejects it again with the RegExp variants.
 */

/** Thai case number: running number / Buddhist year — e.g. 123/2567 */
export const CASE_NUMBER_HTML = '[0-9]{1,6}\\/[0-9]{4}';
export const CASE_NUMBER_REGEX = /^[0-9]{1,6}\/[0-9]{4}$/;
export const CASE_NUMBER_HINT = 'รูปแบบต้องเป็น เลขที่/ปีพ.ศ. เช่น 123/2567';

/** Phone: digits with optional +, spaces, dashes and parentheses — 8–20 chars */
// NOTE: `(` and `)` must stay escaped inside the class — HTML `pattern` is
// compiled with the `v` flag, which rejects them bare and then silently
// disables the whole constraint.
export const PHONE_HTML = '\\+?[0-9][0-9\\s\\-\\(\\)]{7,19}';
export const PHONE_REGEX = /^\+?[0-9][0-9\s\-()]{7,19}$/;
export const PHONE_HINT = 'เบอร์โทรต้องเป็นตัวเลข เช่น 081-234-5678';

/** Money: satang precision, must be positive, capped at 100,000,000 baht */
export const MONEY_MIN = 0.01;
export const MONEY_MAX = 100_000_000;
export const MONEY_STEP = '0.01';
export const MONEY_HINT = 'ยอดเงินต้องมากกว่า 0 และไม่เกิน 100,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)';

/** Estimated fee may be 0 (unknown) but never negative */
export const FEE_MIN = 0;
export const FEE_MAX = MONEY_MAX;

/** Billable hours on a single time entry */
export const HOURS_MIN = 0.01;
export const HOURS_MAX = 24;
export const HOURS_HINT = 'ชั่วโมงต้องมากกว่า 0 และไม่เกิน 24 ชั่วโมงต่อรายการ';
