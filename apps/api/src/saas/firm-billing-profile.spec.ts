import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
describe('firm billing profile', () => {
  let controller: any, db: any, storage: any;
  beforeEach(() => {
    db = { firm: { findUnique: jest.fn().mockResolvedValue({ legalName: null, taxId: null, billingAddress: null, vatRegistered: false }),
      update: jest.fn(async ({ data }) => data) }, $transaction: (fn: any) => fn(db), $queryRaw: jest.fn() };
    storage = { put: jest.fn(async (key: string) => key), delete: jest.fn(), openDownloadStream: jest.fn() };
    const { FirmBillingProfileController } = require('./firm-billing-profile.controller');
    controller = new FirmBillingProfileController(db, storage);
  });
  it.each(['taxId', 'legalName', 'billingAddress'])('requires %s before registering VAT', async (missing) => {
    const profile = { vatRegistered: true, taxId: '1234567890123', legalName: 'Law', billingAddress: 'Bangkok', [missing]: undefined };
    await expect(controller.update(user, profile)).rejects.toThrow(BadRequestException);
  });
  it('permits registration with complete data and rejects a lawyer', async () => {
    const profile = { vatRegistered: true, taxId: '1234567890123', legalName: 'Law', billingAddress: 'Bangkok' };
    expect(await controller.update(user, profile)).toMatchObject(profile);
    await expect(controller.update({ ...user, firmRole: FirmRole.LAWYER, role: 'ADMIN' }, profile)).rejects.toThrow(ForbiddenException);
  });
  it('accepts only a real image <= 1 MB and uses a firm-scoped immutable key', async () => {
    await expect(controller.uploadLogo(user, { mimetype: 'image/png', buffer: Buffer.from('not png') })).rejects.toThrow(BadRequestException);
    await expect(controller.uploadLogo(user, { mimetype: 'image/png', buffer: Buffer.alloc(1048577) })).rejects.toThrow(BadRequestException);
    const result = await controller.uploadLogo(user, { mimetype: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
    expect(result.logoKey).toMatch(/^firms\/f1\/billing\/logos\/.+\.png$/);
  });
  it('streams the frozen logo key even after the profile logo has changed', async () => {
    const key = 'firms/f1/billing/logos/11111111-1111-4111-8111-111111111111.png';
    db.firm.findUnique.mockResolvedValue({ logoKey: 'firms/f1/billing/logos/new.png' });
    storage.openDownloadStream.mockResolvedValue({ on: jest.fn(), pipe: jest.fn() });
    await controller.logo(user, { setHeader: jest.fn() }, key);
    expect(storage.openDownloadStream).toHaveBeenCalledWith(key);
  });
  it('will not stream a foreign firm storage key', async () => {
    db.firm.findUnique.mockResolvedValue({ logoKey: 'firms/f2/billing/logos/logo.png' });
    await expect(controller.logo(user, {})).rejects.toThrow(NotFoundException);
    expect(storage.openDownloadStream).not.toHaveBeenCalled();
  });
});
