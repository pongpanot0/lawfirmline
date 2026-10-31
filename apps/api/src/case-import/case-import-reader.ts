import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import {
  CASE_IMPORT_HEADERS,
  CASE_IMPORT_SHEET,
  MAX_IMPORT_ROWS,
  REQUIRED_HEADERS,
  type CaseImportHeader,
} from './case-import-columns';

export type CellValue = string | Date | number;
export interface RawCaseRow {
  rowNumber: number;
  values: Partial<Record<CaseImportHeader, CellValue>>;
}

const KNOWN_HEADERS = new Set<string>(CASE_IMPORT_HEADERS);

/** A cell as the person sees it: rich text joined, formulas as their result, hyperlinks as their text. */
function cellValue(raw: ExcelJS.CellValue): CellValue | undefined {
  if (raw == null) return undefined;
  if (raw instanceof Date || typeof raw === 'number') return raw;
  if (typeof raw === 'string') return raw.trim() || undefined;
  if (typeof raw === 'boolean') return String(raw);
  if ('richText' in raw) return raw.richText.map((part) => part.text).join('').trim() || undefined;
  if ('result' in raw) return cellValue(raw.result as ExcelJS.CellValue);
  if ('text' in raw) return String(raw.text).trim() || undefined;
  return undefined;
}

/** Reads sheet "คดี" by header text. File-level problems throw one Thai BadRequest; row problems are the resolver's. */
export async function readCaseImportSheet(buf: Buffer): Promise<{ rows: RawCaseRow[] }> {
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buf as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('อ่านไฟล์ไม่ได้ — ใช้ไฟล์ .xlsx จาก template ของระบบ');
  }
  const sheet = book.getWorksheet(CASE_IMPORT_SHEET);
  if (!sheet) throw new BadRequestException(`ไม่พบแผ่นงาน "${CASE_IMPORT_SHEET}" — ใช้ template ของระบบ`);

  const columns = new Map<number, CaseImportHeader>();
  sheet.getRow(1).eachCell((cell, col) => {
    const text = String(cellValue(cell.value) ?? '');
    if (KNOWN_HEADERS.has(text)) columns.set(col, text as CaseImportHeader);
  });
  const present = new Set(columns.values());
  const missing = REQUIRED_HEADERS.find((h) => !present.has(h));
  if (missing) throw new BadRequestException(`ไม่พบคอลัมน์ "${missing}" — ใช้ template ของระบบ`);

  const rows: RawCaseRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: RawCaseRow['values'] = {};
    for (const [col, header] of columns) {
      const value = cellValue(row.getCell(col).value);
      if (value !== undefined) values[header] = value;
    }
    if (Object.keys(values).length > 0) rows.push({ rowNumber, values });
  });
  if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`ไฟล์มีคดีเกิน ${MAX_IMPORT_ROWS} แถว — แบ่งเป็นหลายไฟล์`);
  return { rows };
}

const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Excel date cell, or วว/ดด/ปปปป with a Buddhist (> 2400) or Christian year → UTC midnight of that day. */
export function parseImportDate(value: unknown): Date | null | 'INVALID' {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'INVALID' : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = DMY.exec(String(value).trim());
  if (!match) return 'INVALID';
  const [d, m, rawYear] = match.slice(1).map(Number);
  const y = rawYear > 2400 ? rawYear - 543 : rawYear;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : 'INVALID';
}

const AMOUNT = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/;

/** Baht: ≥ 0, thousands commas allowed, at most 2 decimals. */
export function parseAmount(value: unknown): number | null | 'INVALID' {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value >= 0 && Number.isFinite(value) ? Math.round(value * 100) / 100 : 'INVALID';
  const text = String(value).trim();
  return AMOUNT.test(text) ? Number(text.replace(/,/g, '')) : 'INVALID';
}

export const splitList = (value: unknown): string[] =>
  value == null ? [] : String(value).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
