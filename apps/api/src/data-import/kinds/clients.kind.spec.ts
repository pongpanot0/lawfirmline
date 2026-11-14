import { FirmRole } from '@lawfirm/shared';
import { clientsKind, resolveClientRows } from './clients.kind';
import { emptyDeps, importUser, row } from './import-kind.fixtures';

const one = (values: Record<string, string> = {}, existing = new Set<string>(), user = importUser) => resolveClientRows([row({ 'ชื่อลูกความ *': 'บริษัท หนึ่ง', ...values })], { existing }, user)[0];
describe('clients import resolver', () => {
  it('mirrors client creation with a primary contact and a closed portal; free-text type is allowed', () => {
    const draft = one({ ประเภท: 'องค์กรพิเศษ', ผู้ติดต่อหลัก: 'สมชาย', อีเมลผู้ติดต่อ: 'contact@example.com', โทรศัพท์ผู้ติดต่อ: '0812345678', ตำแหน่งผู้ติดต่อ: 'ผู้จัดการ' });
    expect(draft.problems).toEqual([]);
    expect(draft.data.type).toBe('องค์กรพิเศษ');
    expect(draft.data.contacts[0]).toMatchObject({ name: 'สมชาย', isPrimary: true, portalEnabled: false });
    expect(one().data.contacts[0].name).toBe('บริษัท หนึ่ง');
  });
  it.each([
    [{ 'ชื่อลูกความ *': '' }, 'ชื่อลูกความ'],
    [{ อีเมลออกเอกสาร: 'invalid' }, 'อีเมลออกเอกสาร'],
    [{ ผู้ติดต่อหลัก: 'สมชาย', อีเมลผู้ติดต่อ: 'invalid' }, 'อีเมลผู้ติดต่อ'],
    [{ อีเมลผู้ติดต่อ: 'a@example.com' }, 'ต้องกรอกชื่อ'],
    [{ โทรศัพท์ผู้ติดต่อ: '0812345678' }, 'ต้องกรอกชื่อ'],
    [{ ตำแหน่งผู้ติดต่อ: 'ผู้จัดการ' }, 'ต้องกรอกชื่อ'],
    [{ ผู้ติดต่อหลัก: 'สมชาย', โทรศัพท์ผู้ติดต่อ: 'abc' }, 'โทรศัพท์ผู้ติดต่อ'],
  ] as [Record<string, string>, string][])('rejects invalid client cells %p', (values, expected) => expect(one(values).problems.join(' ')).toContain(expected));
  it.each([
    ['ชื่อลูกความ *', 200], ['เลขประจำตัวผู้เสียภาษี', 50], ['สาขา', 120], ['ที่อยู่', 500], ['อีเมลออกเอกสาร', 200], ['โทรศัพท์ออกเอกสาร', 50], ['ผู้ติดต่อหลัก', 200], ['ตำแหน่งผู้ติดต่อ', 100],
  ] as [string, number][])('applies the DTO length limit for %s', (header, limit) => expect(one({ [header]: 'x'.repeat(limit + 1) }).problems.join(' ')).toContain(`ยาวเกิน ${limit}`));
  it('rejects normalized existing and in-file names (including NFKC)', () => {
    expect(one({ 'ชื่อลูกความ *': ' ＡＣＭＥ ' }, new Set(['acme'])).problems.join(' ')).toContain('ในระบบแล้ว');
    const drafts = resolveClientRows([row({ 'ชื่อลูกความ *': 'ＡＣＭＥ' }), row({ 'ชื่อลูกความ *': 'acme' }, 3)], { existing: new Set() }, importUser);
    expect(drafts[1].problems.join(' ')).toContain('แถวที่ 2');
  });
  it.each([{ ...importUser, firmRole: FirmRole.EXTERNAL }, { ...importUser, role: undefined }])('rejects unauthorized callers', (user) => {
    expect(clientsKind(emptyDeps).canImport(user)).toBe(false);
    expect(one({}, new Set(), user).problems.join(' ')).toContain('ไม่มีสิทธิ์');
  });
});
