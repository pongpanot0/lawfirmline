import * as Db from '../generated/prisma';
import { LICENSE_MILESTONES, LawyerLicenseType, PaperFileAction } from '@lawfirm/shared';

/** The shared enums are what DTOs validate against; the DB enums are what Prisma writes. They must not drift. */
describe('office-operations enums match the database', () => {
  it.each([
    ['LawyerLicenseType', LawyerLicenseType],
    ['PaperFileAction', PaperFileAction],
  ])('%s', (name, shared) => {
    const db = (Db as unknown as Record<string, Record<string, string>>)[name];
    expect(Object.values(db).sort()).toEqual(Object.values(shared).sort());
  });

  it('NotificationCategory has LICENSE', () => {
    expect(Object.values(Db.NotificationCategory)).toContain('LICENSE');
  });

  it('licence milestones are offsets in days from expiry', () => {
    expect(LICENSE_MILESTONES.OPEN_90).toBe(-90);
    expect(LICENSE_MILESTONES.LATE_45).toBe(45);
    expect(Object.keys(LICENSE_MILESTONES)).toEqual(['OPEN_90', 'DUE_30', 'DUE_7', 'EXPIRED', 'LATE_45']);
  });
});
