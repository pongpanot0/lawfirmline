import * as ExcelJS from 'exceljs';
import { CASE_IMPORT_HEADERS, CASE_IMPORT_SHEET } from './case-import-columns';
import { buildCaseImportTemplate } from './case-import-template';

describe('buildCaseImportTemplate', () => {
  let book: ExcelJS.Workbook;

  beforeAll(async () => {
    const buf = await buildCaseImportTemplate({
      caseTypes: ['คดีแพ่ง', 'คดีประกันภัย'],
      lawyers: [{ name: 'Anan Boonma', email: 'anan@firm.co' }, { name: 'Siriporn Kaew', email: 'siri@firm.co' }],
    });
    book = new ExcelJS.Workbook();
    await book.xlsx.load(buf as unknown as ExcelJS.Buffer);
  });

  it('writes the headers in order on sheet คดี', () => {
    const sheet = book.getWorksheet(CASE_IMPORT_SHEET)!;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...CASE_IMPORT_HEADERS]);
  });

  it.each(['ชั้นศาล *', 'ฐานะลูกความ', 'ประเภทคดี', 'ขั้นตอนคดี', 'สถานะ', 'ผลคดี'])(
    'adds a list dropdown to %s on every data row',
    (header) => {
      const sheet = book.getWorksheet(CASE_IMPORT_SHEET)!;
      const col = CASE_IMPORT_HEADERS.indexOf(header as never) + 1;
      for (const row of [2, 301]) {
        expect(sheet.getCell(row, col).dataValidation).toMatchObject({ type: 'list' });
      }
    },
  );

  it("explains every column and lists the firm's lawyers", () => {
    const help = book.getWorksheet('วิธีกรอก')!;
    const text: string[] = [];
    help.eachRow((row) => row.eachCell((cell) => text.push(String(cell.value))));
    for (const header of CASE_IMPORT_HEADERS) expect(text).toContain(header);
    expect(text).toEqual(expect.arrayContaining(['anan@firm.co', 'siri@firm.co', 'ปิดแล้ว']));
  });

  it('keeps dropdown values on a hidden sheet', () => {
    const lists = book.getWorksheet('lists')!;
    expect(['hidden', 'veryHidden']).toContain(lists.state);
    const values: unknown[] = [];
    lists.eachRow((row) => row.eachCell((cell) => values.push(cell.value)));
    expect(values).toEqual(expect.arrayContaining(['คดีแพ่ง', 'คดีประกันภัย', 'ศาลชั้นต้น', 'ถอนฟ้อง-ยุติ']));
  });
});
