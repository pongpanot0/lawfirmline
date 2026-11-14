import { CourtLevel, FirmRole } from '@lawfirm/shared';
import { caseNaturalSignature, CaseLookups, resolveImportCaseRows } from './cases.kind';
import { importUser, row, staffLookups } from './import-kind.fixtures';

const base = { 'ชื่อคดี *': 'คดีหนึ่ง', 'ทนายหลัก (อีเมล) *': 'lawyer@example.com', 'ชั้นศาล *': 'ศาลชั้นต้น' };
const lookups = (): CaseLookups => ({
  members: staffLookups().members, lawyers: [{ id: 'lawyer', name: 'ทนาย หนึ่ง', email: 'lawyer@example.com' }], clients: [{ id: 'client', name: 'บริษัท หนึ่ง' }], types: [{ id: 'type', name: 'แพ่ง' }],
  lawyersByEmail: new Map([['lawyer@example.com', 'lawyer']]), membersByEmail: new Map(staffLookups().members.map((member) => [member.email, member.id])),
  clientsByName: new Map([['บริษัท หนึ่ง', 'client']]), caseTypesByName: new Map([['แพ่ง', 'type']]), existingOwnRefs: new Set(['OLD001']), existingNumbers: [{ number: 'พ1/2568', court: 'ศาลแพ่ง', ownRef: 'OLD001' }], existingNatural: new Set(), today: new Date('2026-11-14T00:00:00Z'),
});
const one = (values: Record<string, string> = {}, user = importUser) => resolveImportCaseRows([row({ ...base, ...values })], lookups(), user)[0];
describe('cases import wrapper resolver', () => {
  it('preserves the existing resolver payload and supplies resolved refs/display names', () => {
    const draft = one({ ลูกความ: 'บริษัท หนึ่ง', ประเภทคดี: 'แพ่ง', 'ทีม (อีเมล คั่นด้วย ;)': 'assistant@example.com', วันเปิดคดี: '01/01/2568' });
    expect(draft).toMatchObject({ problems: [], title: 'คดีหนึ่ง', courtLevel: CourtLevel.TRIAL, clientId: 'client', caseTypeId: 'type', leadLawyerId: 'lawyer', buddyIds: ['assistant'], refs: { userIds: ['lawyer', 'assistant'], clientIds: ['client'], caseTypeIds: ['type'] } });
    expect(draft.cells['ทนายหลัก (อีเมล) *']).toContain('ทนาย หนึ่ง');
    expect(draft.cells['ทีม (อีเมล คั่นด้วย ;)']).toContain('ผู้ช่วย หนึ่ง');
    expect(draft.cells['ลูกความ']).toBe('บริษัท หนึ่ง');
    expect(one({ สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', วันปิดคดี: '01/01/2568' })).toMatchObject({ problems: [], closed: true });
  });
  it.each([
    [{ 'ชื่อคดี *': '' }, 'ชื่อคดี'], [{ 'ทนายหลัก (อีเมล) *': '' }, 'อีเมลทนายหลัก'], [{ 'ชั้นศาล *': '' }, 'ชั้นศาล'],
    [{ 'ทนายหลัก (อีเมล) *': 'invalid' }, 'อีเมลไม่ถูกต้อง'], [{ 'ทนายหลัก (อีเมล) *': 'foreign@example.com' }, 'ไม่พบทนาย'],
    [{ 'ทีม (อีเมล คั่นด้วย ;)': 'invalid' }, 'อีเมลไม่ถูกต้อง'], [{ 'ทีม (อีเมล คั่นด้วย ;)': 'external@example.com' }, 'ไม่พบสมาชิก'],
    [{ 'ทีม (อีเมล คั่นด้วย ;)': 'assistant@example.com; ASSISTANT@example.com' }, 'อีเมลซ้ำ'],
    [{ 'ชั้นศาล *': 'constructor' }, 'ชั้นศาล'], [{ ฐานะลูกความ: 'toString' }, 'ฐานะลูกความ'], [{ ขั้นตอนคดี: 'constructor' }, 'ขั้นตอนคดี'], [{ สถานะ: 'ปิดแล้ว', ผลคดี: 'constructor' }, 'ผลคดี'],
    [{ ประเภทคดี: 'ไม่พบ' }, 'ไม่พบประเภทคดี'], [{ เลขคดีดำ: 'bad' }, 'เลขคดีดำ'], [{ เลขคดีแดง: 'bad' }, 'เลขคดีแดง'],
    [{ 'ทุนทรัพย์ (บาท)': 'bad' }, 'ทุนทรัพย์'], [{ 'ค่าวิชาชีพประมาณการ (บาท)': 'bad' }, 'ค่าวิชาชีพ'], [{ วันครบอายุความ: '31/02/2569' }, 'วันครบอายุความ'],
    [{ วันเปิดคดี: '01/01/2570' }, 'อนาคต'], [{ สถานะ: 'ไม่ถูกต้อง' }, 'สถานะ'], [{ สถานะ: 'ปิดแล้ว', ผลคดี: '' }, 'เลือกผลคดี'],
    [{ สถานะ: 'ปิดแล้ว', ผลคดี: 'ชนะคดี', สรุปตอนปิด: 'สั้น' }, 'อย่างน้อย 10'],
  ] as [Record<string, string>, string][])('reports invalid case cells %p', (values, expected) => expect(one(values).problems.join(' ')).toContain(expected));
  it.each([
    ['ชื่อคดี *', 300], ['เลขอ้างอิงภายใน', 50], ['เลขอ้างอิงลูกค้า', 100], ['ลูกความ', 300], ['ศาล', 200], ['สรุปตอนปิด', 2000], ['รายละเอียด', 5000],
  ] as [string, number][])('applies existing DTO length for %s', (header, limit) => expect(one({ [header]: 'x'.repeat(limit + 1) }).problems.join(' ')).toContain(`ยาวเกิน ${limit}`));
  it('limits team and opponents using existing DTO boundaries', () => {
    const refs = lookups();
    const buddies = Array.from({ length: 21 }, (_, index) => `person${index}@example.com`);
    buddies.forEach((email, index) => refs.membersByEmail.set(email, `member-${index}`));
    const result = resolveImportCaseRows([row({ ...base, 'ทีม (อีเมล คั่นด้วย ;)': buddies.join(';'), 'คู่ความฝ่ายตรงข้าม (คั่นด้วย ;)': Array.from({ length: 31 }, () => 'x'.repeat(201)).join(';') })], refs, importUser)[0];
    expect(result.problems.join(' ')).toContain('สมาชิกทีมเกิน 20');
    expect(result.problems.join(' ')).toContain('คู่ความเกิน 30');
    expect(result.problems.join(' ')).toContain('ยาวเกิน 200');
  });
  it('rejects existing and in-file ownRef/number duplicates without replacing old behavior', () => {
    expect(one({ เลขอ้างอิงภายใน: 'OLD001' }).problems.join(' ')).toContain('ในระบบแล้ว');
    expect(one({ เลขคดีดำ: 'พ1/2568', ศาล: 'ศาลแพ่ง' }).problems.join(' ')).toContain('ในระบบแล้ว');
    expect(resolveImportCaseRows([row({ ...base, เลขอ้างอิงภายใน: 'NEW001' }), row({ ...base, เลขอ้างอิงภายใน: 'NEW001' }, 3)], lookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
  });
  it('catches no-key duplicates with a stable natural signature, existing or earlier in the file', () => {
    const refs = lookups(); refs.existingNatural.add(caseNaturalSignature(one()));
    expect(resolveImportCaseRows([row(base)], refs, importUser)[0].problems.join(' ')).toContain('ในระบบแล้ว');
    expect(resolveImportCaseRows([row(base), row(base, 3)], lookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
    expect(resolveImportCaseRows([row({ ...base, เลขอ้างอิงภายใน: 'NEW001' }), row(base, 3)], lookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
    expect(resolveImportCaseRows([row(base), row({ ...base, เลขอ้างอิงภายใน: 'NEW001' }, 3)], lookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
  });
  it('rejects external and missing legacy-role callers', () => {
    expect(one({}, { ...importUser, firmRole: FirmRole.EXTERNAL }).problems.join(' ')).toContain('ไม่มีสิทธิ์');
    expect(one({}, { ...importUser, role: undefined }).problems.join(' ')).toContain('ไม่มีสิทธิ์');
  });
});
