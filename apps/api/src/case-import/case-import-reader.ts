import { readImportSheet } from '../common/excel-import/reader';
import { CASE_IMPORT_HEADERS, CASE_IMPORT_SHEET, MAX_IMPORT_ROWS, REQUIRED_HEADERS, type CaseImportHeader } from './case-import-columns';

export { cellValue, declaredInflatedSize, dateProblems, parseImportDate, parseAmount, splitList } from '../common/excel-import/reader';
export type { CellValue } from '../common/excel-import/reader';
import type { CellValue } from '../common/excel-import/reader';

export interface RawCaseRow {
  rowNumber: number;
  values: Partial<Record<CaseImportHeader, CellValue>>;
}

export const readCaseImportSheet = (buf: Buffer): Promise<{ rows: RawCaseRow[] }> => readImportSheet(buf, {
  sheet: CASE_IMPORT_SHEET,
  headers: CASE_IMPORT_HEADERS,
  required: REQUIRED_HEADERS,
  maxRows: MAX_IMPORT_ROWS,
  rowLimitMessage: `ไฟล์มีคดีเกิน ${MAX_IMPORT_ROWS} แถว — แบ่งเป็นหลายไฟล์`,
});
