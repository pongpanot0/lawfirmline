import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { CASE_IMPORT_HEADERS, CASE_IMPORT_SHEET } from './case-import-columns';
import { parseAmount, parseImportDate, readCaseImportSheet, splitList } from './case-import-reader';

async function workbook(headers: readonly string[], rows: unknown[][], sheetName = CASE_IMPORT_SHEET, blankTail = 0) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow([...headers]);
  for (const row of rows) sheet.addRow(row);
  // Formatted-but-empty rows, as a template that was scrolled and styled leaves behind.
  for (let i = 0; i < blankTail; i++) sheet.getCell(sheet.rowCount + 1, 1).numFmt = '@';
  return Buffer.from(await book.xlsx.writeBuffer());
}

const day = (d: Date | null | 'INVALID') => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

describe('readCaseImportSheet', () => {
  it('reads values by header text even when columns are reordered', async () => {
    const headers = ['ชั้นศาล *', 'ชื่อคดี *', 'ทนายหลัก (อีเมล) *', 'เลขคดีดำ'];
    const { rows } = await readCaseImportSheet(await workbook(headers, [['ศาลชั้นต้น', 'คดี A', 'a@x.co', 'พ264/2569']]));
    expect(rows).toEqual([
      { rowNumber: 2, values: { 'ชั้นศาล *': 'ศาลชั้นต้น', 'ชื่อคดี *': 'คดี A', 'ทนายหลัก (อีเมล) *': 'a@x.co', เลขคดีดำ: 'พ264/2569' } },
    ]);
  });

  it('rejects a sheet missing a required header', async () => {
    const buf = await workbook(['ชื่อคดี *', 'ชั้นศาล *'], [['คดี A', 'ศาลชั้นต้น']]);
    await expect(readCaseImportSheet(buf)).rejects.toThrow(new BadRequestException('ไม่พบคอลัมน์ "ทนายหลัก (อีเมล) *" — ใช้ template ของระบบ'));
  });

  it('rejects a file without sheet คดี', async () => {
    const buf = await workbook(CASE_IMPORT_HEADERS, [], 'Sheet1');
    await expect(readCaseImportSheet(buf)).rejects.toThrow('ไม่พบแผ่นงาน "คดี" — ใช้ template ของระบบ');
  });

  it('rejects something that is not an xlsx file', async () => {
    await expect(readCaseImportSheet(Buffer.from('not a zip'))).rejects.toThrow('อ่านไฟล์ไม่ได้ — ใช้ไฟล์ .xlsx จาก template ของระบบ');
  });

  it('skips empty rows', async () => {
    const r = (title: string) => [title, 'a@x.co', 'ศาลชั้นต้น'];
    const buf = await workbook(CASE_IMPORT_HEADERS, [r('A'), r('B'), ['', '  ', ''], r('C')], CASE_IMPORT_SHEET, 50);
    const { rows } = await readCaseImportSheet(buf);
    expect(rows.map((x) => x.rowNumber)).toEqual([2, 3, 5]);
  });

  it('rejects more than 300 rows', async () => {
    const rows = Array.from({ length: 301 }, (_, i) => [`คดี ${i}`, 'a@x.co', 'ศาลชั้นต้น']);
    await expect(readCaseImportSheet(await workbook(CASE_IMPORT_HEADERS, rows))).rejects.toThrow('ไฟล์มีคดีเกิน 300 แถว — แบ่งเป็นหลายไฟล์');
  });

  it('rejects an unknown column header instead of dropping its data', async () => {
    const headers = [...CASE_IMPORT_HEADERS.slice(0, 15), 'วันหมดอายุความ'];
    await expect(readCaseImportSheet(await workbook(headers, [['คดี A', 'a@x.co', 'ศาลชั้นต้น']]))).rejects.toThrow(
      'ไม่รู้จักคอลัมน์ "วันหมดอายุความ" — ใช้ชื่อคอลัมน์ตาม template ของระบบ',
    );
  });

  it('refuses a file that inflates past the size cap before parsing it', async () => {
    const book = new ExcelJS.Workbook();
    const s = book.addWorksheet(CASE_IMPORT_SHEET);
    s.addRow([...CASE_IMPORT_HEADERS]);
    // Highly compressible text: small on disk, large once unzipped.
    for (let i = 0; i < 3000; i++) s.addRow([`${i} ${'ก'.repeat(5000)}`, 'a@x.co', 'ศาลชั้นต้น']); // unique, so shared strings can't dedupe
    const buf = Buffer.from(await book.xlsx.writeBuffer());
    expect(buf.length).toBeLessThan(2 * 1024 * 1024);
    await expect(readCaseImportSheet(buf)).rejects.toThrow('ไฟล์ใหญ่เกินไปเมื่อแตกไฟล์ — ใช้ template ของระบบ ไม่เกิน 300 แถว');
  });

  it('reads formula results and rich text as text', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet(CASE_IMPORT_SHEET);
    sheet.addRow([...CASE_IMPORT_HEADERS]);
    sheet.getCell('A2').value = { richText: [{ text: 'คดี ' }, { text: 'ตัวหนา', font: { bold: true } }] };
    sheet.getCell('B2').value = { formula: 'LOWER("A@X.CO")', result: 'a@x.co' };
    sheet.getCell('C2').value = 'ศาลชั้นต้น';
    const { rows } = await readCaseImportSheet(Buffer.from(await book.xlsx.writeBuffer()));
    expect(rows[0].values['ชื่อคดี *']).toBe('คดี ตัวหนา');
    expect(rows[0].values['ทนายหลัก (อีเมล) *']).toBe('a@x.co');
  });
});

describe('parseImportDate', () => {
  it('reads Excel dates and dd/mm/yyyy in BE or CE', () => {
    expect(day(parseImportDate(new Date(Date.UTC(2026, 2, 15))))).toBe('2026-03-15');
    expect(day(parseImportDate('15/03/2569'))).toBe('2026-03-15');
    expect(day(parseImportDate('15/03/2026'))).toBe('2026-03-15');
    expect(day(parseImportDate(' 5/3/2569 '))).toBe('2026-03-05');
  });

  it('converts a Buddhist year that Excel stored inside a real date cell', () => {
    // Typing 15/03/2569 into a date-formatted cell stores the year 2569 CE.
    expect(day(parseImportDate(new Date(Date.UTC(2569, 2, 15))))).toBe('2026-03-15');
  });

  it('rejects impossible or malformed dates and treats blank as none', () => {
    expect(parseImportDate('31/02/2569')).toBe('INVALID');
    expect(parseImportDate('2569-03-15')).toBe('INVALID');
    expect(parseImportDate('พรุ่งนี้')).toBe('INVALID');
    expect(parseImportDate('')).toBeNull();
    expect(parseImportDate(undefined)).toBeNull();
  });
});

describe('parseAmount', () => {
  it('parses amounts', () => {
    expect(parseAmount('1,250,000.50')).toBe(1250000.5);
    expect(parseAmount(98000)).toBe(98000);
    expect(parseAmount('')).toBeNull();
  });

  it.each(['-5', 'abc', '1.234', '1,2,3x'])('rejects %s', (v) => expect(parseAmount(v)).toBe('INVALID'));
});

describe('splitList', () => {
  it('splits on ; and newlines, trimming and dropping blanks', () => {
    expect(splitList('a@x.co; b@x.co\nc@x.co;')).toEqual(['a@x.co', 'b@x.co', 'c@x.co']);
    expect(splitList(undefined)).toEqual([]);
  });
});
