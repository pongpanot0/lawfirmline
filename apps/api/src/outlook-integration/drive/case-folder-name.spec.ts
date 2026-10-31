import { CASE_NUMBER_REGEX, CaseOutcome, CourtLevel } from '@lawfirm/shared';
import { parseCaseFolderName, ParsedCaseFolder } from './case-folder-name';

const { TRIAL, APPEAL, SUPREME } = CourtLevel;
const W = CaseOutcome.WITHDRAWN;
const strip = (name: string) => name.replace(/^\d+\.\s*/, '');

// Real folder names from the firm's OneDrive ("11111. บาร์ริสเตอร์").
type Row = [string, Omit<ParsedCaseFolder, 'title'> & { title?: string }];
const rows: Row[] = [
  ['89. คำให้การ - พ264.69 - ศ.แพ่ง - แฟมมิลี่ & เมเจอร์ ซินีเพล็กซ์ (โบ, พี่ปิง)',
    { blackCaseNumber: 'พ264/2569', caseNumberRaw: 'พ264.69', courtName: 'ศ.แพ่ง', courtLevel: TRIAL, closed: false, outcome: null, teamHint: 'โบ, พี่ปิง' }],
  ['86. คำฟ้อง - พE291.69 - ศจ.สมุทรปราการ - TMSTH & นายแสงเพชร (ยักยอก) (โบ)',
    { blackCaseNumber: 'พE291/2569', caseNumberRaw: 'พE291.69', courtName: 'ศจ.สมุทรปราการ', courtLevel: TRIAL, closed: false, outcome: null, teamHint: 'โบ' }],
  ['36. จำเลย - ผบE6635-65 -ศาลจ.บุรีรัมย์ - น.ส.วาสนา - อลิอันซ์',
    { blackCaseNumber: 'ผบE6635/2565', caseNumberRaw: 'ผบE6635-65', courtName: 'ศาลจ.บุรีรัมย์', courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
  ['21. คำฟ้อง - TMSTH - Dextrans, พงษ์ศิริ, E.H - กค.187.65',
    { blackCaseNumber: 'กค187/2565', caseNumberRaw: 'กค.187.65', courtName: null, courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
  ['47. คำเบิกความ - ศาลแขวงระยอง -มE399.2566',
    { blackCaseNumber: 'มE399/2566', caseNumberRaw: 'มE399.2566', courtName: 'ศาลแขวงระยอง', courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
  ['12. ฟังคำพิพากษา - กค.35,40-2564',
    { blackCaseNumber: null, caseNumberRaw: 'กค.35,40-2564', courtName: null, courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
  ['32. คำให้การ - มิตซุย & อลิอันซ์ จำเลยที่ 7 - กค.152-25655',
    { blackCaseNumber: null, caseNumberRaw: 'กค.152-25655', courtName: null, courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
  ['20. แก้อุทธรณ์- N.K. Siam & Excell Transport - กค186.64',
    { blackCaseNumber: 'กค186/2564', caseNumberRaw: 'กค186.64', courtName: null, courtLevel: APPEAL, closed: false, outcome: null, teamHint: null }],
  ['4. คัดค้านฎีกา-บจ.ชอคโก้ฮอลิค - บจ.ซิลเวอร์ ไลน์',
    { blackCaseNumber: null, caseNumberRaw: null, courtName: null, courtLevel: SUPREME, closed: false, outcome: null, teamHint: null }],
  ['24. ฟ้อง - TMNF - การท่า - close',
    { blackCaseNumber: null, caseNumberRaw: null, courtName: null, courtLevel: TRIAL, closed: true, outcome: null, teamHint: null }],
  ['76. คำให้การ - กค50.68 - AIG ประกันภัย & Nippon TH, Nippon, SQ Air (ถอนฟ้อง)',
    { blackCaseNumber: 'กค50/2568', caseNumberRaw: 'กค50.68', courtName: null, courtLevel: TRIAL, closed: true, outcome: W, teamHint: 'ถอนฟ้อง' }],
  ['14. เตรียมฟ้อง - TMSTH & บจ.วีฮิเคิล (รถยนต์ มาสด้า2)',
    { blackCaseNumber: null, caseNumberRaw: null, courtName: null, courtLevel: TRIAL, closed: false, outcome: null, teamHint: 'รถยนต์ มาสด้า2' }],
  ['45. (2-6-66) claim ใหม่ วิริยะ (Close)',
    { blackCaseNumber: null, caseNumberRaw: null, courtName: null, courtLevel: TRIAL, closed: true, outcome: null, teamHint: 'Close' }],
  ['B. คดีทางการแพทย์',
    { title: 'คดีทางการแพทย์', blackCaseNumber: null, caseNumberRaw: null, courtName: null, courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
  ['แบบฟอร์มศาล',
    { title: 'แบบฟอร์มศาล', blackCaseNumber: null, caseNumberRaw: null, courtName: null, courtLevel: TRIAL, closed: false, outcome: null, teamHint: null }],
];

describe('parseCaseFolderName', () => {
  it.each(rows)('%s', (name, expected) => {
    expect(parseCaseFolderName(name)).toEqual({ title: strip(name), ...expected });
  });

  it('only ever proposes numbers the case form accepts', () => {
    for (const [name] of rows) {
      const { blackCaseNumber } = parseCaseFolderName(name);
      if (blackCaseNumber) expect(blackCaseNumber).toMatch(CASE_NUMBER_REGEX);
    }
  });
});
