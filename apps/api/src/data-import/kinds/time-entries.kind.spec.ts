import { FirmRole, MONEY_MAX } from '@lawfirm/shared';
import { resolveTimeEntryRows, TIME_HEADERS, timeEntrySignature } from './time-entries.kind';
import { importUser, row, staffLookups } from './import-kind.fixtures';

const base = { 'วันที่ *': '15/12/2569', 'เลขอ้างอิงคดี *': 'REF001', 'ชั่วโมง *': '1.5' };
const worker = TIME_HEADERS[3]; const rate = TIME_HEADERS[4];
const one = (values: Record<string, string | number> = {}, user = importUser) => resolveTimeEntryRows([row({ ...base, ...values })], staffLookups(), user)[0];
describe('time entries import resolver', () => {
  it('resolves default worker rate and billable, allows a zero explicit rate, and uses zero when unset', () => {
    expect(one()).toMatchObject({ problems: [], caseId: 'case-a', userId: 'owner', hours: 1.5, rate: 2500, billable: true, refs: { userIds: ['owner'] } });
    expect(one({ [rate]: '0', เรียกเก็บได้: 'ไม่' })).toMatchObject({ problems: [], rate: 0, billable: false });
    expect(one({ [worker]: 'lawyer@example.com' })).toMatchObject({ problems: [], userId: 'lawyer', rate: 0 });
    expect(one({ [worker]: 'assistant@example.com', [rate]: '1,000.50' })).toMatchObject({ problems: [], userId: 'assistant', rate: 1000.5 });
  });
  it.each(['0.001', '.5', '24', 1e-7])('accepts finite positive hours through 24 without an arbitrary decimal floor (%s)', (hours) => expect(one({ 'ชั่วโมง *': hours }).problems).toEqual([]));
  it.each([
    [{ 'วันที่ *': '' }, 'วันที่'], [{ 'เลขอ้างอิงคดี *': '' }, 'เลขอ้างอิงคดี'], [{ 'ชั่วโมง *': '' }, 'ชั่วโมง'],
    [{ 'วันที่ *': '31/02/2569' }, 'วันที่ไม่ถูกต้อง'], [{ 'เลขอ้างอิงคดี *': 'FOREIGN' }, 'ไม่พบคดี FOREIGN หรือคุณไม่มีสิทธิ์ในคดีนี้'],
    [{ 'ชั่วโมง *': '0' }, 'ต้องมากกว่า 0'], [{ 'ชั่วโมง *': '-1' }, 'ต้องมากกว่า 0'], [{ 'ชั่วโมง *': '24.01' }, 'ไม่เกิน 24'], [{ 'ชั่วโมง *': '1.5hours' }, 'ต้องมากกว่า 0'],
    [{ 'ชั่วโมง *': 'Infinity' }, 'ต้องมากกว่า 0'], [{ 'ชั่วโมง *': Infinity }, 'ต้องมากกว่า 0'], [{ 'ชั่วโมง *': '0x10' }, 'ต้องมากกว่า 0'],
    [{ [worker]: 'wrong' }, 'อีเมลไม่ถูกต้อง'], [{ [worker]: 'foreign@example.com' }, 'ไม่พบสมาชิก'], [{ [rate]: '-1' }, 'จำนวนเงินไม่ถูกต้อง'], [{ [rate]: 'abc' }, 'จำนวนเงินไม่ถูกต้อง'],
    [{ [rate]: String(MONEY_MAX + 1) }, 'ต้องอยู่ระหว่าง'], [{ รายละเอียด: 'x'.repeat(501) }, 'ยาวเกิน 500'], [{ เรียกเก็บได้: 'maybe' }, 'ใช่ หรือ ไม่'],
  ] as [Record<string, string | number>, string][])('reports invalid time cells %p', (values, expected) => expect(one(values).problems.join(' ')).toContain(expected));
  it('checks caller permission and importer membership', () => {
    expect(one({}, { ...importUser, id: 'unknown' }).problems.join(' ')).toContain('ไม่พบสมาชิก');
    expect(one({ [worker]: 'owner@example.com' }, { ...importUser, id: 'lawyer', firmRole: FirmRole.LAWYER }).problems.join(' ')).toContain('ไม่มีสิทธิ์ระบุผู้ทำงาน');
    expect(one({}, { ...importUser, firmRole: FirmRole.EXTERNAL }).problems.join(' ')).toContain('ไม่มีสิทธิ์');
  });
  it.each([Infinity, -1, MONEY_MAX + 1])('validates a stale or corrupt member default rate (%s)', (value) => {
    const lookups = staffLookups(); lookups.members[0].defaultHourlyRate = value;
    expect(resolveTimeEntryRows([row(base)], lookups, importUser)[0].problems.join(' ')).toContain('ต้องอยู่ระหว่าง');
  });
  it('rejects in-file and existing time signatures', () => {
    const lookups = staffLookups(); lookups.existing.add(timeEntrySignature(one()));
    expect(resolveTimeEntryRows([row(base)], lookups, importUser)[0].problems.join(' ')).toContain('ในระบบแล้ว');
    expect(resolveTimeEntryRows([row(base), row(base, 3)], staffLookups(), importUser)[1].problems.join(' ')).toContain('แถวที่ 2');
  });
});
