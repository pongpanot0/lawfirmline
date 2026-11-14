import { buildImportTemplate } from '../common/excel-import/template';
import type { TemplateSpec } from '../common/excel-import/types';
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
  REQUIRED_HEADERS,
} from './case-import-columns';

export function caseImportTemplateSpec(input: {
  caseTypes: string[];
  lawyers: { name: string; email: string }[];
}): TemplateSpec {
  const firstEmail = input.lawyers[0]?.email ?? 'lawyer@firm.co';
  return {
    sheet: CASE_IMPORT_SHEET, headers: CASE_IMPORT_HEADERS, required: REQUIRED_HEADERS, maxRows: MAX_IMPORT_ROWS,
    help: HEADER_HELP,
    dateHeaders: ['วันครบอายุความ', 'วันเปิดคดี', 'วันปิดคดี'],
    dropdowns: [
      ['ชั้นศาล *', Object.keys(COURT_LEVEL_BY_LABEL)],
      ['ฐานะลูกความ', Object.keys(PARTY_ROLE_BY_LABEL)],
      ['ประเภทคดี', input.caseTypes],
      ['ขั้นตอนคดี', Object.keys(STAGE_BY_LABEL)],
      ['สถานะ', Object.values(STATUS_LABELS)],
      ['ผลคดี', Object.keys(OUTCOME_BY_LABEL)],
    ],
    examples: [
      ['คำให้การ - แฟมมิลี่ & เมเจอร์', firstEmail, 'ศาลชั้นต้น', '', '', '', 'บริษัท ตัวอย่าง จำกัด', 'จำเลย',
        'นายสมชาย ใจดี', '', 'ศาลแพ่ง', 'พ264/2569', '', '1,250,000', '', '', 'สืบพยาน', '15/02/2569', 'เปิดอยู่'],
      ['คำฟ้อง - TMSTH & การท่า', firstEmail, 'ศาลชั้นต้น', '', '', '', '', 'โจทก์', 'การท่าเรือ', '', '', 'กค50/2568',
        '', '', '', '', '', '01/03/2568', 'ปิดแล้ว', 'ถอนฟ้อง-ยุติ', '30/09/2568', 'ถอนฟ้องหลังเจรจาสำเร็จ'],
    ],
    extraHelp: [{ title: 'อีเมลทนายของสำนักงาน', rows: input.lawyers.map(l => [l.name, l.email]) }],
  };
}

export const buildCaseImportTemplate = (input: Parameters<typeof caseImportTemplateSpec>[0]): Promise<Buffer> =>
  buildImportTemplate(caseImportTemplateSpec(input));
