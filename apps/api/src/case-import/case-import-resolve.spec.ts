import { CaseOutcome, CaseStage, CourtLevel, PartyRole } from '@lawfirm/shared';
import type { RawCaseRow } from './case-import-reader';
import { ImportLookups, resolveCaseRows } from './case-import-resolve';

const TODAY = new Date(Date.UTC(2026, 9, 31));
const lookups = (extra: Partial<ImportLookups> = {}): ImportLookups => ({
  lawyersByEmail: new Map([['anan@firm.co', 'u-anan']]),
  membersByEmail: new Map([['anan@firm.co', 'u-anan'], ['siri@firm.co', 'u-siri']]),
  clientsByName: new Map([['acme จำกัด', 'c-acme']]),
  caseTypesByName: new Map([['คดีแพ่ง', 't-civil']]),
  existingOwnRefs: new Set(['TSB-0001']),
  existingNumbers: [{ number: 'พ1/2569', court: 'ศาลแพ่ง', ownRef: 'TSB-0007' }, { number: 'พ9/2569', court: null, ownRef: 'TSB-0009' }],
  ...extra,
});
const base = { 'ชื่อคดี *': 'คดี A', 'ทนายหลัก (อีเมล) *': 'Anan@Firm.co', 'ชั้นศาล *': 'ศาลชั้นต้น' } as RawCaseRow['values'];
const row = (values: RawCaseRow['values'], rowNumber = 2): RawCaseRow => ({ rowNumber, values: { ...base, ...values } });
const one = (values: RawCaseRow['values'], l = lookups()) => resolveCaseRows([row(values)], l, TODAY)[0];

describe('resolveCaseRows', () => {
  it('maps a full open row', () => {
    const d = one({
      'ทีม (อีเมล คั่นด้วย ;)': 'siri@firm.co; anan@firm.co',
      เลขอ้างอิงภายใน: 'TSB-0100',
      เลขอ้างอิงลูกค้า: 'CL-9',
      ลูกความ: '  ACME จำกัด ',
      ฐานะลูกความ: 'จำเลย',
      'คู่ความฝ่ายตรงข้าม (คั่นด้วย ;)': 'นายสมชาย; บจ.ตัวอย่าง',
      ประเภทคดี: 'คดีแพ่ง',
      ศาล: 'ศาลแพ่ง',
      เลขคดีดำ: 'พ264/2569',
      เลขคดีแดง: 'พ1/2570',
      'ทุนทรัพย์ (บาท)': '1,250,000',
      'ค่าวิชาชีพประมาณการ (บาท)': 50000,
      วันครบอายุความ: '01/12/2570',
      ขั้นตอนคดี: 'สืบพยาน',
      วันเปิดคดี: '15/02/2569',
      ผลคดี: 'ชนะคดี',
      วันปิดคดี: '01/03/2569',
      รายละเอียด: 'หมายเหตุ',
    });
    expect(d).toEqual({
      rowNumber: 2,
      problems: [],
      title: 'คดี A',
      leadEmail: 'Anan@Firm.co',
      leadLawyerId: 'u-anan',
      buddyIds: ['u-siri'],
      courtLevel: CourtLevel.TRIAL,
      ownRef: 'TSB-0100',
      customerRef: 'CL-9',
      clientId: 'c-acme',
      clientName: 'ACME จำกัด',
      clientMatched: true,
      partyRole: PartyRole.DEFENDANT,
      opponents: ['นายสมชาย', 'บจ.ตัวอย่าง'],
      caseTypeId: 't-civil',
      courtName: 'ศาลแพ่ง',
      blackCaseNumber: 'พ264/2569',
      redCaseNumber: 'พ1/2570',
      claimedAmount: 1250000,
      estimatedFee: 50000,
      limitationDeadline: '2027-12-01',
      stage: CaseStage.HEARING,
      openedAt: '2026-02-15',
      closed: false,
      description: 'หมายเหตุ',
    });
  });

  it('keeps an unknown client as a name only', () => {
    expect(one({ ลูกความ: 'บริษัท ใหม่' })).toMatchObject({ clientId: undefined, clientName: 'บริษัท ใหม่', clientMatched: false });
  });

  it('fills a closed row and ignores stage', () => {
    const d = one({ สถานะ: 'ปิดแล้ว', ผลคดี: 'ถอนฟ้อง-ยุติ', วันปิดคดี: '30/09/2568', ขั้นตอนคดี: 'สืบพยาน', วันเปิดคดี: '01/03/2568' });
    expect(d).toMatchObject({
      problems: [],
      closed: true,
      outcome: CaseOutcome.WITHDRAWN,
      closedAt: '2025-09-30',
      closingSummary: 'นำเข้าจาก Excel: คดี A',
      stage: undefined,
    });
  });

  it.each<[string, RawCaseRow['values'], string]>([
    ['title', { 'ชื่อคดี *': undefined }, 'ยังไม่ได้กรอกชื่อคดี'],
    ['lead', { 'ทนายหลัก (อีเมล) *': 'x@other.co' }, 'ไม่พบทนายอีเมล x@other.co ในสำนักงาน'],
    ['lead missing', { 'ทนายหลัก (อีเมล) *': undefined }, 'ยังไม่ได้กรอกอีเมลทนายหลัก'],
    ['court level', { 'ชั้นศาล *': 'ศาลสูง' }, 'ชั้นศาลไม่ถูกต้อง: ศาลสูง'],
    ['team', { 'ทีม (อีเมล คั่นด้วย ;)': 'ghost@x.co' }, 'ไม่พบสมาชิกอีเมล ghost@x.co ในสำนักงาน'],
    ['party role', { ฐานะลูกความ: 'ผู้เสียหาย' }, 'ฐานะลูกความไม่ถูกต้อง: ผู้เสียหาย'],
    ['case type', { ประเภทคดี: 'คดีอาญา' }, 'ไม่พบประเภทคดี คดีอาญา'],
    ['black', { เลขคดีดำ: '264.69' }, 'เลขคดีดำไม่ถูกรูปแบบ'],
    ['red', { เลขคดีแดง: 'x/1' }, 'เลขคดีแดงไม่ถูกรูปแบบ'],
    ['claimed', { 'ทุนทรัพย์ (บาท)': '-1' }, 'ทุนทรัพย์ไม่ถูกต้อง'],
    ['fee', { 'ค่าวิชาชีพประมาณการ (บาท)': 'abc' }, 'ค่าวิชาชีพไม่ถูกต้อง'],
    ['limitation', { วันครบอายุความ: '31/02/2570' }, 'วันครบอายุความไม่ถูกต้อง'],
    ['stage', { ขั้นตอนคดี: 'ปิดคดี' }, 'ขั้นตอนคดีไม่ถูกต้อง: ปิดคดี'],
    ['opened', { วันเปิดคดี: 'เมื่อวาน' }, 'วันเปิดคดีไม่ถูกต้อง'],
    ['opened future', { วันเปิดคดี: '01/01/2570' }, 'วันเปิดคดีอยู่ในอนาคต'],
    ['status', { สถานะ: 'พักไว้' }, 'สถานะไม่ถูกต้อง: พักไว้'],
    ['closed no outcome', { สถานะ: 'ปิดแล้ว' }, 'เลือกผลคดีของคดีที่ปิดแล้ว'],
    ['outcome', { สถานะ: 'ปิดแล้ว', ผลคดี: 'เสมอ' }, 'ผลคดีไม่ถูกต้อง: เสมอ'],
    ['closed date', { สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', วันปิดคดี: '99/99/2569' }, 'วันปิดคดีไม่ถูกต้อง'],
    ['closed before opened', { สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', วันเปิดคดี: '01/05/2569', วันปิดคดี: '01/04/2569' }, 'วันปิดคดีก่อนวันเปิดคดี'],
    ['closed future', { สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', วันปิดคดี: '01/01/2570' }, 'วันปิดคดีอยู่ในอนาคต'],
    ['summary', { สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', สรุปตอนปิด: 'สั้น' }, 'สรุปตอนปิดต้องยาวอย่างน้อย 10 ตัวอักษร'],
  ])('reports %s', (_label, values, problem) => {
    expect(one(values).problems).toContain(problem);
  });

  it('ignores outcome and close date on an open row', () => {
    expect(one({ ผลคดี: 'เสมอ', วันปิดคดี: 'xx' })).toMatchObject({ problems: [], outcome: undefined, closedAt: undefined });
  });

  it('flags duplicates against the firm and inside the file', () => {
    const rows = [
      row({ เลขคดีดำ: 'พ1/2569', ศาล: 'ศาลแพ่ง' }, 2),
      row({ เลขคดีดำ: 'พ1/2569', ศาล: 'ศาลอาญา' }, 3),
      row({ เลขคดีดำ: 'พ9/2569', ศาล: 'ศาลใดก็ได้' }, 4),
      row({ เลขคดีดำ: 'พ5/2569', ศาล: 'ศาลแพ่ง' }, 5),
      row({ เลขคดีดำ: 'พ5/2569', ศาล: ' ศาลแพ่ง ' }, 6),
      row({ เลขอ้างอิงภายใน: 'TSB-0001' }, 7),
      row({ เลขอ้างอิงภายใน: 'NEW-1' }, 8),
      row({ เลขอ้างอิงภายใน: 'NEW-1' }, 9),
    ];
    const problems = resolveCaseRows(rows, lookups(), TODAY).map((d) => d.problems);
    expect(problems).toEqual([
      ['มีคดีนี้ในระบบแล้ว (TSB-0007)'],
      [],
      ['มีคดีนี้ในระบบแล้ว (TSB-0009)'],
      [],
      ['ซ้ำกับแถวที่ 5 ในไฟล์'],
      ['มีคดีนี้ในระบบแล้ว (TSB-0001)'],
      [],
      ['ซ้ำกับแถวที่ 8 ในไฟล์'],
    ]);
  });
});
