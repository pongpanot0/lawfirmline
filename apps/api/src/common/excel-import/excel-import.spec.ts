import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { AuthUser, FirmRole, Role } from '@lawfirm/shared';
import { readImportSheet } from './reader';
import { buildImportTemplate } from './template';
import { createImportRegistry } from '../../data-import/import-registry';
import type { ImportKindDeps } from '../../data-import/import-kind';
import type { TemplateSpec } from './types';

const user = { id: 'u1', firmId: 'f1', role: Role.ADMIN, firmRole: FirmRole.OWNER, email: 'owner@firm.co', firstName: 'Owner', lastName: 'Firm' } as AuthUser;
const deps = { caseAccess: { getCaseFilterForUser: () => ({ firmId: user.firmId, deletedAt: null }), getTaskAccessFilterForUser: () => ({ firmId: user.firmId }) } } as unknown as ImportKindDeps;
const definitions = createImportRegistry(deps);

async function specFor(kind: typeof definitions[number]): Promise<TemplateSpec> {
  const db = Object.fromEntries(['user', 'firmMember', 'client', 'case', 'caseType', 'caseProceeding', 'task', 'calendarEvent', 'expense', 'timeEntry', 'invitation']
    .map(key => [key, { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) }]));
  Object.assign(db, { firm: { findUnique: jest.fn().mockResolvedValue({ maxUsers: 5 }) } });
  const lookups = await kind.lookups(db as never, user);
  return { sheet: kind.sheet, headers: kind.headers, required: kind.required, maxRows: 300, help: kind.help, ...kind.template(lookups, user) };
}

describe.each(definitions)('$kind generic Excel template/reader contract', kind => {
  let spec: TemplateSpec;
  let book: ExcelJS.Workbook;

  beforeEach(async () => {
    spec = await specFor(kind);
    book = new ExcelJS.Workbook();
    await book.xlsx.load(await buildImportTemplate(spec) as unknown as ExcelJS.Buffer);
  });

  it('round-trips the kind template and a filled row without importing help/examples', async () => {
    expect(await readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec)).toEqual({ rows: [] });
    const sheet = book.getWorksheet(spec.sheet)!;
    const values = spec.examples?.[0] ?? spec.headers.map((_, index) => `ตัวอย่าง ${index + 1}`);
    values.forEach((value, index) => { sheet.getCell(2, index + 1).value = value; });
    const { rows } = await readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec);
    expect(rows).toHaveLength(1); expect(rows[0].rowNumber).toBe(2);
    const expected = Object.fromEntries(values.flatMap((value, index) => value === '' ? [] : [[spec.headers[index], value]]));
    expect(rows[0].values).toEqual(expected);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(sheet.getRow(1).font.bold).toBe(true);
    expect(book.getWorksheet('lists')!.state).toBe('veryHidden');
    const help: string[] = [];
    book.getWorksheet('วิธีกรอก')!.eachRow(row => row.eachCell(cell => { help.push(String(cell.value)); }));
    for (const header of spec.headers) { expect(spec.help[header]).toBeTruthy(); expect(help).toContain(header); }
    for (const header of spec.dateHeaders ?? []) expect(sheet.getColumn(spec.headers.indexOf(header) + 1).numFmt).toBe('@');
    for (const [header, values] of spec.dropdowns ?? []) {
      if (values.length) expect(sheet.getCell(301, spec.headers.indexOf(header) + 1).dataValidation.type).toBe('list');
    }
  });

  it('rejects an unknown column instead of silently dropping data', async () => {
    book.getWorksheet(spec.sheet)!.getCell(1, spec.headers.length + 1).value = 'คอลัมน์ที่ไม่มี';
    await expect(readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec)).rejects.toThrow('ไม่รู้จักคอลัมน์ "คอลัมน์ที่ไม่มี"');
  });

  it('rejects a missing required header', async () => {
    const header = spec.required[0];
    book.getWorksheet(spec.sheet)!.getCell(1, spec.headers.indexOf(header) + 1).value = null;
    await expect(readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec)).rejects.toThrow(`ไม่พบคอลัมน์ "${header}"`);
  });
});

describe('generic file-level errors', () => {
  const spec: TemplateSpec = { sheet: 'ข้อมูล', headers: ['ชื่อ'], required: ['ชื่อ'], maxRows: 2, help: { ชื่อ: 'ชื่อ' } };

  it('rejects unreadable/wrong sheet/too many rows with Thai BadRequests', async () => {
    await expect(readImportSheet(Buffer.from('invalid'), spec)).rejects.toBeInstanceOf(BadRequestException);
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('ผิดแผ่นงาน'); sheet.addRow(['ชื่อ']);
    await expect(readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec)).rejects.toThrow('ไม่พบแผ่นงาน "ข้อมูล"');
    sheet.name = 'ข้อมูล'; ['A', 'B', 'C'].forEach(name => sheet.addRow([name]));
    await expect(readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec)).rejects.toThrow('ไฟล์มีข้อมูลเกิน 2 แถว');
  });

  it('matches headers in any order, skips blank rows and preserves Excel row numbers', async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('ข้อมูล');
    sheet.addRow(['ชื่อ']); sheet.getCell('A4').value = '  ลูกความ  ';
    expect(await readImportSheet(Buffer.from(await book.xlsx.writeBuffer()), spec)).toEqual({ rows: [{ rowNumber: 4, values: { ชื่อ: 'ลูกความ' } }] });
  });
});
