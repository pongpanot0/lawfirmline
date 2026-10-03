import { FirmRole } from '@lawfirm/shared';
import { assertFirmRefs } from './firm-refs';

describe('assertFirmRefs', () => {
  const inFirm = new Set(['c1', 'k1', 't1', 'u1']);
  const count = jest.fn(async ({ where }: any) => (where.id?.in ?? where.userId?.in).filter((id: string) => inFirm.has(id)).length);
  const db = { client: { count }, clientContact: { count }, caseType: { count }, firmMember: { count } } as any;
  beforeEach(() => count.mockClear());

  it('passes when every named row is the firm\'s, ignoring blanks and duplicates', async () => {
    await expect(assertFirmRefs(db, 'f1', { clientIds: ['c1', 'c1', null], contactIds: ['k1'], caseTypeIds: [undefined, 't1'], userIds: ['u1'] })).resolves.toBeUndefined();
  });

  it.each([
    [{ clientIds: ['c1', 'other'] }, 'ลูกความ'],
    [{ contactIds: ['other'] }, 'ผู้ติดต่อ'],
    [{ caseTypeIds: ['other'] }, 'ประเภทคดี'],
    [{ userIds: ['other'] }, 'ผู้ใช้'],
  ])('rejects an id from another firm (%o)', async (refs, message) => {
    await expect(assertFirmRefs(db, 'f1', refs)).rejects.toThrow(message);
  });

  it('scopes each lookup to the firm', async () => {
    await assertFirmRefs(db, 'f1', { contactIds: ['k1'] });
    expect(count.mock.calls[0][0].where).toEqual({ id: { in: ['k1'] }, client: { firmId: 'f1' } });
  });

  it('asks nothing when nothing is named', async () => {
    await assertFirmRefs(db, 'f1', {});
    expect(count).not.toHaveBeenCalled();
  });

  it('rejects users with excluded roles when excludeRoles is set', async () => {
    const dbWithRole = {
      ...db,
      firmMember: {
        count: jest.fn(async ({ where }: any) => {
          // Check if the excludeRoles clause is present
          if (where.role?.notIn) {
            // Simulate: u1 is ASSISTANT (allowed), but exclude EXTERNAL, so if u1 exists but EXTERNAL is excluded, count is 0
            return (where.userId?.in ?? []).includes('u1') && !where.role.notIn.includes('ASSISTANT') ? 1 : 0;
          }
          return (where.userId?.in ?? []).includes('u1') ? 1 : 0;
        }),
      },
    } as any;

    await expect(
      assertFirmRefs(dbWithRole, 'f1', { userIds: ['u1'] }, { excludeRoles: [FirmRole.EXTERNAL] }),
    ).resolves.toBeUndefined();

    // When trying with a user that would be filtered out, it should fail
    const dbRejectExternal = {
      ...db,
      firmMember: {
        count: jest.fn(async ({ where }: any) => {
          // If excluding EXTERNAL, and u1 is EXTERNAL, return 0 (not found)
          if (where.role?.notIn?.includes(FirmRole.EXTERNAL)) {
            return 0;
          }
          return (where.userId?.in ?? []).includes('u1') ? 1 : 0;
        }),
      },
    } as any;

    await expect(
      assertFirmRefs(dbRejectExternal, 'f1', { userIds: ['u1'] }, { excludeRoles: [FirmRole.EXTERNAL] }),
    ).rejects.toThrow('ผู้ใช้ที่เลือกไม่ได้อยู่ในสำนักงานนี้หรือมีบทบาทที่ไม่อนุญาต');
  });

  it('names only staff by default — a freelancer is excluded unless the caller opts in', async () => {
    await assertFirmRefs(db, 'f1', { userIds: ['u1'] });
    expect(count.mock.calls[0][0].where.role).toEqual({ notIn: ['EXTERNAL'] });
    count.mockClear();
    await assertFirmRefs(db, 'f1', { userIds: ['u1'] }, { excludeRoles: [] });
    expect(count.mock.calls[0][0].where.role).toBeUndefined();
  });
});
