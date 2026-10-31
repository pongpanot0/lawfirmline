import * as ExcelJS from 'exceljs';
import {
  CASE_IMPORT_HEADERS,
  CASE_IMPORT_SHEET,
  COURT_LEVEL_BY_LABEL,
  HEADER_HELP,
  MAX_IMPORT_ROWS,
  OUTCOME_BY_LABEL,
  PARTY_ROLE_BY_LABEL,
  STAGE_BY_LABEL,
  STATUS_LABELS,
  type CaseImportHeader,
} from './case-import-columns';

const LAST_ROW = MAX_IMPORT_ROWS + 1;
const DATE_HEADERS: CaseImportHeader[] = ['วันครบอายุความ', 'วันเปิดคดี', 'วันปิดคดี'];

/** The firm's own template: dropdowns from its case types, help sheet listing its lawyers. */
export async function buildCaseImportTemplate(input: {
  caseTypes: string[];
  lawyers: { name: string; email: string }[];
}): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(CASE_IMPORT_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  const help = book.addWorksheet('วิธีกรอก');
  const lists = book.addWorksheet('lists', { state: 'veryHidden' });

  sheet.addRow([...CASE_IMPORT_HEADERS]).font = { bold: true };
  sheet.columns.forEach((col) => (col.width = 22));

  const listColumns: [CaseImportHeader, string[]][] = [
    ['ชั้นศาล *', Object.keys(COURT_LEVEL_BY_LABEL)],
    ['ฐานะลูกความ', Object.keys(PARTY_ROLE_BY_LABEL)],
    ['ประเภทคดี', input.caseTypes],
    ['ขั้นตอนคดี', Object.keys(STAGE_BY_LABEL)],
    ['สถานะ', Object.values(STATUS_LABELS)],
    ['ผลคดี', Object.keys(OUTCOME_BY_LABEL)],
  ];
  listColumns.forEach(([header, values], i) => {
    const letter = String.fromCharCode(65 + i);
    values.forEach((value, r) => (lists.getCell(`${letter}${r + 1}`).value = value));
    if (values.length === 0) return;
    const col = CASE_IMPORT_HEADERS.indexOf(header) + 1;
    const formula = `lists!$${letter}$1:$${letter}$${values.length}`;
    for (let row = 2; row <= LAST_ROW; row++) {
      sheet.getCell(row, col).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: 'ค่าไม่อยู่ในรายการ',
        error: 'เลือกจากรายการเท่านั้น',
      };
    }
  });
  for (const header of DATE_HEADERS) sheet.getColumn(CASE_IMPORT_HEADERS.indexOf(header) + 1).numFmt = 'dd/mm/yyyy';

  help.columns = [{ width: 34 }, { width: 70 }];
  help.addRow(['คอลัมน์', 'วิธีกรอก']).font = { bold: true };
  for (const header of CASE_IMPORT_HEADERS) help.addRow([header, HEADER_HELP[header]]);
  help.addRow([]);
  help.addRow(['ตัวอย่าง']).font = { bold: true };
  help.addRow([...CASE_IMPORT_HEADERS]);
  const firstEmail = input.lawyers[0]?.email ?? 'lawyer@firm.co';
  help.addRow(['คำให้การ - แฟมมิลี่ & เมเจอร์', firstEmail, 'ศาลชั้นต้น', '', '', '', 'บริษัท ตัวอย่าง จำกัด', 'จำเลย',
    'นายสมชาย ใจดี', '', 'ศาลแพ่ง', 'พ264/2569', '', '1,250,000', '', '', 'สืบพยาน', '15/02/2569', 'เปิดอยู่']);
  help.addRow(['คำฟ้อง - TMSTH & การท่า', firstEmail, 'ศาลชั้นต้น', '', '', '', '', 'โจทก์', 'การท่าเรือ', '', '', 'กค50/2568',
    '', '', '', '', '', '01/03/2568', 'ปิดแล้ว', 'ถอนฟ้อง-ยุติ', '30/09/2568', 'ถอนฟ้องหลังเจรจาสำเร็จ']);
  help.addRow([]);
  help.addRow(['อีเมลทนายของสำนักงาน']).font = { bold: true };
  for (const lawyer of input.lawyers) help.addRow([lawyer.name, lawyer.email]);

  return Buffer.from(await book.xlsx.writeBuffer());
}
