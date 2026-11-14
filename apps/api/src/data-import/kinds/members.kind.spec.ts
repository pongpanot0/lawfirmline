import { FIRM_ROLE_LABELS, FirmRole } from '@lawfirm/shared';
import { canImportMembers, membersKind, MemberLookups, resolveMemberRows } from './members.kind';
import { emptyDeps, importUser, row, staffLookups } from './import-kind.fixtures';

const base = { 'อีเมล *': 'new@example.com', 'ตำแหน่ง *': FIRM_ROLE_LABELS[FirmRole.ASSISTANT].th };
const lookups = (): MemberLookups => ({ members: staffLookups().members, memberEmails: new Set(['owner@example.com']), pendingEmails: new Set(['pending@example.com']) });
const one = (values: Record<string, string> = {}, user = importUser) => resolveMemberRows([row({ ...base, ...values })], lookups(), user)[0];
describe('members import resolver', () => {
  it('normalizes invitation emails and resolves Thai roles, including external invite targets', () => {
    expect(one({ 'อีเมล *': ' New@Example.COM ' })).toMatchObject({ problems: [], email: 'new@example.com', role: FirmRole.ASSISTANT });
    expect(one({ 'ตำแหน่ง *': FIRM_ROLE_LABELS[FirmRole.EXTERNAL].th })).toMatchObject({ problems: [], role: FirmRole.EXTERNAL });
  });
  it.each([
    [{ 'อีเมล *': '' }, 'อีเมล'], [{ 'ตำแหน่ง *': '' }, 'ตำแหน่ง'], [{ 'อีเมล *': 'invalid' }, 'อีเมลไม่ถูกต้อง'],
    [{ 'ตำแหน่ง *': 'ไม่มี' }, 'ตำแหน่งไม่ถูกต้อง'], [{ 'ตำแหน่ง *': 'constructor' }, 'ตำแหน่งไม่ถูกต้อง'], [{ 'ตำแหน่ง *': 'toString' }, 'ตำแหน่งไม่ถูกต้อง'],
    [{ 'ตำแหน่ง *': FIRM_ROLE_LABELS[FirmRole.OWNER].th }, 'ไม่อนุญาต'],
    [{ 'อีเมล *': 'OWNER@example.com' }, 'เป็นสมาชิก'], [{ 'อีเมล *': 'Pending@example.com' }, 'ยังไม่หมดอายุ'],
  ] as [Record<string, string>, string][])('reports invalid invitation cells %p', (values, expected) => expect(one(values).problems.join(' ')).toContain(expected));
  it('rejects in-file duplicate emails and allows expired/accepted invitation identities', () => {
    const drafts = resolveMemberRows([row(base), row({ ...base, 'อีเมล *': ' NEW@EXAMPLE.COM ' }, 3)], lookups(), importUser);
    expect(drafts[1].problems.join(' ')).toContain('แถวที่ 2');
    expect(one({ 'อีเมล *': 'expired@example.com' }).problems).toEqual([]);
    expect(one({ 'อีเมล *': 'accepted.but.not.member@example.com' }).problems).toEqual([]);
  });
  it('applies invite capability and per-row role ceiling; never offers OWNER', () => {
    const manager = { ...importUser, firmRole: FirmRole.OFFICE_MANAGER };
    expect(one({ 'ตำแหน่ง *': FIRM_ROLE_LABELS[FirmRole.OFFICE_MANAGER].th }, manager).problems.join(' ')).toContain('ไม่มีสิทธิ์เชิญ');
    expect(one({ 'ตำแหน่ง *': FIRM_ROLE_LABELS[FirmRole.SENIOR_LAWYER].th }, manager).problems).toEqual([]);
    for (const firmRole of [FirmRole.LAWYER, FirmRole.EXTERNAL]) {
      const user = { ...importUser, firmRole };
      expect(canImportMembers(user)).toBe(false);
      expect(one({}, user).problems.join(' ')).toContain('ไม่มีสิทธิ์');
    }
    const dropdown = membersKind(emptyDeps).template(lookups(), manager).dropdowns![0][1];
    expect(dropdown).not.toContain(FIRM_ROLE_LABELS[FirmRole.OWNER].th);
    expect(dropdown).not.toContain(FIRM_ROLE_LABELS[FirmRole.OFFICE_MANAGER].th);
  });
});
