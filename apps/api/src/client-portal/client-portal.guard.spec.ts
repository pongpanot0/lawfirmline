import { ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ClientPortalGuard } from './client-portal.guard';

describe('ClientPortalGuard tenant match', () => {
  const passport = jest.spyOn(AuthGuard('client-portal-jwt').prototype, 'canActivate');
  const context = (resolvedFirmId: string | null) => {
    const req = { user: { firmId: 'A' }, resolvedFirmId };
    return { switchToHttp: () => ({ getRequest: () => req }) } as any;
  };
  const guard = new ClientPortalGuard();

  beforeEach(() => passport.mockReset().mockResolvedValue(true));
  afterAll(() => passport.mockRestore());

  it("a firm-A client is refused on firm B's subdomain", async () => {
    await expect(guard.canActivate(context('B'))).rejects.toThrow(ForbiddenException);
  });

  it('own subdomain and apex pass', async () => {
    await expect(guard.canActivate(context('A'))).resolves.toBe(true);
    await expect(guard.canActivate(context(null))).resolves.toBe(true);
  });
});
