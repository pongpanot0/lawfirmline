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

/** 300 template rows unzip to well under 1 MB; this leaves room for formatting without letting a zip bomb in. */
const MAX_INFLATED_BYTES = 20 * 1024 * 1024;

/**
 * Total uncompressed size the zip's central directory declares, or null when it isn't a zip.
 * ponytail: trusts the declared sizes; a streaming reader that counts real bytes would close a forged-header bomb too.
 */
function declaredInflatedSize(buf: Buffer): number | null {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) !== 0x06054b50) continue;
    const entries = buf.readUInt16LE(i + 10);
    let p = buf.readUInt32LE(i + 16);
    let total = 0;
    for (let e = 0; e < entries; e++) {
      if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return null;
      total += buf.readUInt32LE(p + 24);
      p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    }
    return total;
  }
  return null;
}

/** Reads sheet "คดี" by header text. File-level problems throw one Thai BadRequest; row problems are the resolver's. */
export async function readCaseImportSheet(buf: Buffer): Promise<{ rows: RawCaseRow[] }> {
  const inflated = declaredInflatedSize(buf);
  if (inflated === null) throw new BadRequestException('อ่านไฟล์ไม่ได้ — ใช้ไฟล์ .xlsx จาก template ของระบบ');
  if (inflated > MAX_INFLATED_BYTES) throw new BadRequestException('ไฟล์ใหญ่เกินไปเมื่อแตกไฟล์ — ใช้ template ของระบบ ไม่เกิน 300 แถว');
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
    if (!text) return;
    // A renamed column would otherwise drop every value under it without a word.
    if (!KNOWN_HEADERS.has(text)) throw new BadRequestException(`ไม่รู้จักคอลัมน์ "${text}" — ใช้ชื่อคอลัมน์ตาม template ของระบบ`);
    columns.set(col, text as CaseImportHeader);
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

/** Open must not be in the future; a closed case closes on or after it opens and not in the future. */
export function dateProblems(d: { openedAt?: Date | null; closedAt?: Date | null; closed: boolean }, today: Date): string[] {
  const problems: string[] = [];
  if (d.openedAt && d.openedAt > today) problems.push('วันเปิดคดีอยู่ในอนาคต');
  if (d.closed && d.closedAt) {
    if (d.openedAt && d.closedAt < d.openedAt) problems.push('วันปิดคดีก่อนวันเปิดคดี');
    if (d.closedAt > today) problems.push('วันปิดคดีอยู่ในอนาคต');
  }
  return problems;
}

const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Excel date cell, or วว/ดด/ปปปป with a Buddhist (> 2400) or Christian year → UTC midnight of that day. */
export function parseImportDate(value: unknown): Date | null | 'INVALID' {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return 'INVALID';
    // Typing 15/03/2569 into a date cell stores the year 2569 CE: the Buddhist year needs the same -543.
    const year = value.getUTCFullYear();
    return new Date(Date.UTC(year > 2400 ? year - 543 : year, value.getUTCMonth(), value.getUTCDate()));
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
