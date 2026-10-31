import { CASE_STAGE_LABELS_TH, CaseOutcome, CaseStage, COURT_LEVEL_LABELS, CourtLevel, PartyRole } from '@lawfirm/shared';

/** The template is the contract: columns are found by this exact header text, in any order. */
export const CASE_IMPORT_SHEET = 'คดี';
export const MAX_IMPORT_ROWS = 300;

export const CASE_IMPORT_HEADERS = [
  'ชื่อคดี *',
  'ทนายหลัก (อีเมล) *',
  'ชั้นศาล *',
  'ทีม (อีเมล คั่นด้วย ;)',
  'เลขอ้างอิงภายใน',
  'เลขอ้างอิงลูกค้า',
  'ลูกความ',
  'ฐานะลูกความ',
  'คู่ความฝ่ายตรงข้าม (คั่นด้วย ;)',
  'ประเภทคดี',
  'ศาล',
  'เลขคดีดำ',
  'เลขคดีแดง',
  'ทุนทรัพย์ (บาท)',
  'ค่าวิชาชีพประมาณการ (บาท)',
  'วันครบอายุความ',
  'ขั้นตอนคดี',
  'วันเปิดคดี',
  'สถานะ',
  'ผลคดี',
  'วันปิดคดี',
  'สรุปตอนปิด',
  'รายละเอียด',
] as const;
export type CaseImportHeader = (typeof CASE_IMPORT_HEADERS)[number];
export const REQUIRED_HEADERS: CaseImportHeader[] = ['ชื่อคดี *', 'ทนายหลัก (อีเมล) *', 'ชั้นศาล *'];

/** One line per column for the "วิธีกรอก" sheet. */
export const HEADER_HELP: Record<CaseImportHeader, string> = {
  'ชื่อคดี *': 'ชื่อที่ใช้เรียกคดีในระบบ',
  'ทนายหลัก (อีเมล) *': 'อีเมลของทนายเจ้าของคดี (ดูรายชื่อด้านล่าง)',
  'ชั้นศาล *': 'เลือกจากรายการ',
  'ทีม (อีเมล คั่นด้วย ;)': 'อีเมลสมาชิกในทีม คั่นด้วย ;',
  'เลขอ้างอิงภายใน': 'เว้นว่างได้ ระบบออกเลขให้',
  'เลขอ้างอิงลูกค้า': 'เลขอ้างอิงของลูกค้า (ถ้ามี)',
  'ลูกความ': 'ถ้าชื่อตรงกับลูกความในระบบจะผูกให้ ถ้าไม่ตรงจะจดชื่อไว้ในคดี',
  'ฐานะลูกความ': 'เลือกจากรายการ',
  'คู่ความฝ่ายตรงข้าม (คั่นด้วย ;)': 'ชื่อคู่ความฝ่ายตรงข้าม คั่นด้วย ;',
  'ประเภทคดี': 'เลือกจากรายการประเภทคดีของสำนักงาน',
  'ศาล': 'ชื่อศาล',
  'เลขคดีดำ': 'เช่น 123/2567, ผบ.1234/2567, พE291/2569',
  'เลขคดีแดง': 'รูปแบบเดียวกับเลขคดีดำ',
  'ทุนทรัพย์ (บาท)': 'ตัวเลข เช่น 1,250,000',
  'ค่าวิชาชีพประมาณการ (บาท)': 'ตัวเลข',
  'วันครบอายุความ': 'วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.) ระบบตั้งเตือนให้',
  'ขั้นตอนคดี': 'เลือกจากรายการ เว้นว่าง = ก่อนฟ้อง',
  'วันเปิดคดี': 'วว/ดด/ปปปป เว้นว่าง = วันนำเข้า',
  'สถานะ': 'เปิดอยู่ หรือ ปิดแล้ว (เว้นว่าง = เปิดอยู่)',
  'ผลคดี': 'ต้องเลือกถ้าปิดแล้ว',
  'วันปิดคดี': 'วว/ดด/ปปปป เฉพาะคดีที่ปิดแล้ว เว้นว่าง = วันนำเข้า',
  'สรุปตอนปิด': 'อย่างน้อย 10 ตัวอักษร เว้นว่างได้',
  'รายละเอียด': 'บันทึกเพิ่มเติม',
};

export const STATUS_LABELS = { open: 'เปิดอยู่', closed: 'ปิดแล้ว' } as const;

export const PARTY_ROLE_BY_LABEL: Record<string, PartyRole> = {
  โจทก์: PartyRole.PLAINTIFF,
  จำเลย: PartyRole.DEFENDANT,
  ผู้ร้อง: PartyRole.PETITIONER,
  ผู้คัดค้าน: PartyRole.RESPONDENT,
};

// Same wording as the close-case dialog.
export const OUTCOME_BY_LABEL: Record<string, CaseOutcome> = {
  ชนะคดี: CaseOutcome.WON,
  ตกลงกันได้: CaseOutcome.SETTLED,
  ไกล่เกลี่ยสำเร็จ: CaseOutcome.MEDIATED,
  แพ้คดี: CaseOutcome.LOST,
  'ถอนฟ้อง-ยุติ': CaseOutcome.WITHDRAWN,
};

/** CLOSING is set by "ปิดแล้ว", never chosen as a stage. */
export const STAGE_BY_LABEL: Record<string, CaseStage> = Object.fromEntries(
  Object.entries(CASE_STAGE_LABELS_TH)
    .filter(([stage]) => stage !== CaseStage.CLOSING)
    .map(([stage, label]) => [label, stage as CaseStage]),
);

export const COURT_LEVEL_BY_LABEL: Record<string, CourtLevel> = Object.fromEntries(
  Object.entries(COURT_LEVEL_LABELS).map(([level, label]) => [label, level as CourtLevel]),
);
