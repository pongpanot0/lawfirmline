import { CASE_NUMBER_REGEX } from '@lawfirm/shared';
import type { CreateExcelCaseRow, ExcelCaseDraft } from './api';

// Server problems about fields the review table can edit — recomputed here instead.
const EDITABLE_PROBLEM_PREFIXES = [
  'ยังไม่ได้กรอกชื่อคดี',
  'ยังไม่ได้กรอกอีเมลทนายหลัก',
  'ไม่พบทนายอีเมล',
  'ชั้นศาลไม่ถูกต้อง',
  'เลขคดีดำไม่ถูกรูปแบบ',
  'เลขคดีแดงไม่ถูกรูปแบบ',
  'เลือกผลคดีของคดีที่ปิดแล้ว',
  'ผลคดีไม่ถูกต้อง',
  'สรุปตอนปิดต้องยาวอย่างน้อย',
];

const CLOSE_DATE_PROBLEMS = ['วันปิดคดีไม่ถูกต้อง', 'วันปิดคดีก่อนวันเปิดคดี', 'วันปิดคดีอยู่ในอนาคต'];
const numberKey = (n?: string) => (n ?? '').replace(/[\s.]/g, '');

/**
 * Was this server problem caused by something since edited away? A number duplicate goes once the black number
 * changes (an own-ref one stays — that field isn't editable here); close-date problems go once the row isn't closed.
 * Anything dropped is checked again by the server on create.
 */
function editedAway(p: string, d: ExcelCaseDraft, uploaded?: { blackCaseNumber?: string }): boolean {
  if (!d.closed && CLOSE_DATE_PROBLEMS.includes(p)) return true;
  if (!uploaded || numberKey(d.blackCaseNumber) === numberKey(uploaded.blackCaseNumber)) return false;
  if (d.ownRef) return p !== `มีคดีนี้ในระบบแล้ว (${d.ownRef})` && p.startsWith('มีคดีนี้ในระบบแล้ว');
  return p.startsWith('มีคดีนี้ในระบบแล้ว') || p.startsWith('ซ้ำกับแถวที่');
}

/**
 * What still blocks this row: the server's findings on fields only the file can fix, plus a fresh check of the
 * editable ones. `uploaded` is the row as the file had it, so edits can clear what they fixed.
 */
export function excelRowProblems(d: ExcelCaseDraft, uploaded?: { blackCaseNumber?: string }): string[] {
  const kept = d.problems.filter(
    (p) => !EDITABLE_PROBLEM_PREFIXES.some((prefix) => p.startsWith(prefix)) && !editedAway(p, d, uploaded),
  );
  const fresh: string[] = [];
  if (!d.title.trim()) fresh.push('ยังไม่ได้กรอกชื่อคดี');
  if (!d.leadLawyerId) fresh.push('ยังไม่ได้เลือกทนายหลัก');
  if (d.blackCaseNumber?.trim() && !CASE_NUMBER_REGEX.test(d.blackCaseNumber.trim())) fresh.push('เลขคดีดำไม่ถูกรูปแบบ');
  if (d.redCaseNumber?.trim() && !CASE_NUMBER_REGEX.test(d.redCaseNumber.trim())) fresh.push('เลขคดีแดงไม่ถูกรูปแบบ');
  if (d.closed && !d.outcome) fresh.push('เลือกผลคดีของคดีที่ปิดแล้ว');
  if (d.closed && (d.closingSummary ?? '').trim().length < 10) fresh.push('สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร');
  return [...fresh, ...kept];
}

/** The create payload: display-only fields dropped, closed-only fields only when closed, no stage on a closed row. */
export function toCreateRow(d: ExcelCaseDraft): CreateExcelCaseRow {
  const { problems: _p, leadEmail: _e, clientMatched: _m, ...row } = d;
  return {
    ...row,
    title: d.title.trim(),
    blackCaseNumber: d.blackCaseNumber?.trim() || undefined,
    redCaseNumber: d.redCaseNumber?.trim() || undefined,
    stage: d.closed ? undefined : d.stage,
    outcome: d.closed ? d.outcome : undefined,
    closingSummary: d.closed ? d.closingSummary?.trim() : undefined,
    closedAt: d.closed ? d.closedAt : undefined,
  };
}
