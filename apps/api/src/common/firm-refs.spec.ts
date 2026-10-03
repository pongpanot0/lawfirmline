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
});
