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

/** What still blocks this row: the server's findings on fields only the file can fix, plus a fresh check of the editable ones. */
export function excelRowProblems(d: ExcelCaseDraft): string[] {
  const kept = d.problems.filter((p) => !EDITABLE_PROBLEM_PREFIXES.some((prefix) => p.startsWith(prefix)));
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
