import { COURT_EVENT_KIND_LABELS, EventType, FirmRole } from '@lawfirm/shared';
import { eventsKind, eventSignature, resolveEventRows } from './events.kind';
import { emptyDeps, importUser, row, staffLookups } from './import-kind.fixtures';

const base = { 'เลขอ้างอิงคดี *': 'REF001', 'หัวข้อ *': 'สืบพยาน', 'ประเภท *': 'นัดศาล', 'วันที่ *': '15/12/2569' };
const one = (values: Record<string, string> = {}, user = importUser) => resolveEventRows([row({ ...base, ...values })], staffLookups(), user)[0];
describe('events import resolver', () => {
  it('resolves Bangkok start/end into UTC and leaves omitted attendees empty like createInternal', () => {
    const draft = one({ ประเภทนัดศาล: Object.values(COURT_EVENT_KIND_LABELS)[0], เวลาเริ่ม: '00:15', เวลาสิ้นสุด: '12:30', 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)': 'LAWYER@example.com; assistant@example.com' });
    expect(draft.problems).toEqual([]);
    expect(draft.data).toMatchObject({ caseId: 'case-a', type: EventType.COURT_DATE, startAt: '2026-12-14T17:15:00.000Z', endAt: '2026-12-15T05:30:00.000Z', assigneeIds: ['lawyer', 'assistant'] });
    expect(draft.refs.userIds).toEqual(['lawyer', 'assistant']);
    expect(one().data).toMatchObject({ startAt: '2026-12-15T02:00:00.000Z', assigneeIds: undefined });
    expect(eventsKind(emptyDeps).sheet).toBe('นัดหมาย-นัดศาล');
  });
  it.each([
    [{ 'เลขอ้างอิงคดี *': '' }, 'เลขอ้างอิงคดี'], [{ 'หัวข้อ *': '' }, 'หัวข้อ'], [{ 'ประเภท *': '' }, 'ประเภท'], [{ 'วันที่ *': '' }, 'วันที่'],
    [{ 'เลขอ้างอิงคดี *': 'FOREIGN' }, 'ไม่พบคดี FOREIGN หรือคุณไม่มีสิทธิ์ในคดีนี้'],
    [{ 'วันที่ *': '30/02/2569' }, 'วันที่ไม่ถูกต้อง'], [{ 'ประเภท *': 'ผิด' }, 'ประเภท *'],
    [{ 'ประเภท *': 'constructor' }, 'ไม่ถูกต้อง'], [{ 'ประเภท *': 'toString' }, 'ไม่ถูกต้อง'], [{ ประเภทนัดศาล: 'constructor' }, 'ประเภทนัดศาล'],
    [{ ประเภทนัดศาล: 'ไม่มี' }, 'ประเภทนัดศาล'], [{ 'ประเภท *': 'อื่น ๆ', ประเภทนัดศาล: Object.values(COURT_EVENT_KIND_LABELS)[0] }, 'เฉพาะนัดศาล'],
    [{ เวลาเริ่ม: '24:00' }, 'เวลาเริ่ม'], [{ เวลาเริ่ม: '9:00' }, 'เวลาเริ่ม'], [{ เวลาสิ้นสุด: '12:99' }, 'เวลาสิ้นสุด'],
    [{ เวลาเริ่ม: '12:00', เวลาสิ้นสุด: '12:00' }, 'ต้องหลังเวลาเริ่ม'], [{ เวลาเริ่ม: '23:00', เวลาสิ้นสุด: '01:00' }, 'วันเดียวกัน'],
    [{ 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)': 'no-email' }, 'อีเมลไม่ถูกต้อง'],
    [{ 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)': 'foreign@example.com' }, 'ไม่พบสมาชิก'],
    [{ 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)': 'lawyer@example.com; LAWYER@example.com' }, 'อีเมลซ้ำ'],
  ] as [Record<string, string>, string][])('rejects invalid event cells %p', (values, expected) => expect(one(values).problems.join(' ')).toContain(expected));
  it.each(['นัดพบลูกความ', 'กำหนดส่ง', 'อื่น ๆ'])('accepts %s without a court kind', (type) => expect(one({ 'ประเภท *': type }).problems).toEqual([]));
  it('rejects more than ten distinct attendees', () => {
    const lookups = staffLookups();
    lookups.members = Array.from({ length: 11 }, (_, index) => ({ ...lookups.members[0], id: String(index), email: `person${index}@example.com` }));
    expect(resolveEventRows([row({ ...base, 'ผู้รับผิดชอบ (อีเมล คั่นด้วย ;)': lookups.members.map((member) => member.email).join(';') })], lookups, importUser)[0].problems.join(' ')).toContain('เกิน 10');
  });
  it('rejects existing and in-file duplicate events; attendee order is irrelevant', () => {
    const lookups = staffLookups(); lookups.existing.add(eventSignature(one().data));
    expect(resolveEventRows([row(base)], lookups, importUser)[0].problems.join(' ')).toContain('ในระบบแล้ว');
    expect(resolveEventRows([row(base), row(base, 3)], staffLookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
    expect(eventSignature({ ...one().data, assigneeIds: ['b', 'a'] })).toBe(eventSignature({ ...one().data, assigneeIds: ['a', 'b'] }));
  });
  it('rejects external importers', () => expect(one({}, { ...importUser, firmRole: FirmRole.EXTERNAL }).problems.join(' ')).toContain('ไม่มีสิทธิ์'));
});
