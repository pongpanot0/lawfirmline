import * as ExcelJS from 'exceljs';
import type { TemplateSpec } from './types';

export async function buildImportTemplate(spec: TemplateSpec): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(spec.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
  const help = book.addWorksheet('วิธีกรอก');
  const lists = book.addWorksheet('lists', { state: 'veryHidden' });
  sheet.addRow([...spec.headers]).font = { bold: true };
  sheet.columns.forEach(col => (col.width = 22));

  (spec.dropdowns ?? []).forEach(([header, values], index) => {
    const listColumn = lists.getColumn(index + 1);
    values.forEach((value, row) => (lists.getCell(row + 1, index + 1).value = value));
    if (!values.length) return;
    const col = spec.headers.indexOf(header) + 1;
    if (!col) throw new Error(`Unknown dropdown header: ${header}`);
    for (let row = 2; row <= spec.maxRows + 1; row++) {
      sheet.getCell(row, col).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`lists!$${listColumn.letter}$1:$${listColumn.letter}$${values.length}`],
        showErrorMessage: true, errorTitle: 'ค่าไม่อยู่ในรายการ', error: 'เลือกจากรายการเท่านั้น',
      };
    }
  });
  // Text prevents Excel guessing the locale or storing a Buddhist year as CE.
  for (const header of spec.dateHeaders ?? []) sheet.getColumn(spec.headers.indexOf(header) + 1).numFmt = '@';

  help.columns = [{ width: 34 }, { width: 70 }];
  help.addRow(['คอลัมน์', 'วิธีกรอก']).font = { bold: true };
  for (const header of spec.headers) help.addRow([header, spec.help[header]]);
  help.addRow([]);
  help.addRow(['ตัวอย่าง']).font = { bold: true };
  help.addRow([...spec.headers]);
  for (const row of spec.examples ?? []) help.addRow(row);
  for (const section of spec.extraHelp ?? []) {
    help.addRow([]);
    help.addRow([section.title]).font = { bold: true };
    for (const row of section.rows) help.addRow(row);
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}
