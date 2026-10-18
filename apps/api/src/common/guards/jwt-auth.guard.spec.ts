import { ForbiddenException, HttpException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FirmRole, SubscriptionStatus } from '@lawfirm/shared';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Runs the real canActivate with passport's own check stubbed to "token valid". */
describe('JwtAuthGuard', () => {
  const passport = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');
  const context = (user: unknown, method = 'GET', resolvedFirmId: string | null = null) => {
    const req = { user, method, resolvedFirmId };
    return { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => 'handler', getClass: () => 'class' } as any;
  };
  const reflector = { getAllAndOverride: jest.fn() } as any;
  const guard = new JwtAuthGuard(reflector);

  beforeEach(() => {
    passport.mockReset().mockResolvedValue(true);
    reflector.getAllAndOverride.mockReset();
  });
  afterAll(() => passport.mockRestore());

  it('a freelancer is refused on a staff route', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(context({ firmRole: FirmRole.EXTERNAL }))).rejects.toThrow(ForbiddenException);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith('allowExternal', ['handler', 'class']);
  });

  it('a freelancer passes a route marked @AllowExternal', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context({ firmRole: FirmRole.EXTERNAL }))).resolves.toBe(true);
  });

  it('staff pass without any metadata lookup', async () => {
    await expect(guard.canActivate(context({ firmRole: FirmRole.LAWYER }))).resolves.toBe(true);
    expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
  });

  describe('subscription gate', () => {
    const expired = { firmRole: FirmRole.LAWYER, subscriptionStatus: SubscriptionStatus.EXPIRED };

    it('an expired firm can still read', async () => {
      await expect(guard.canActivate(context(expired, 'GET'))).resolves.toBe(true);
    });

    it('an expired firm gets 402 on a write', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      const err = await guard.canActivate(context(expired, 'POST')).catch(e => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(402);
      expect(err.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('skipSubscription', ['handler', 'class']);
    });

    it('a canceled firm gets 402 on a write too', async () => {
      const canceled = { ...expired, subscriptionStatus: SubscriptionStatus.CANCELED };
      await expect(guard.canActivate(context(canceled, 'DELETE'))).rejects.toThrow(HttpException);
    });

    it('@SkipSubscription lets an expired firm write (billing, logout)', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      await expect(guard.canActivate(context(expired, 'POST'))).resolves.toBe(true);
    });

    it.each([SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE])('%s firms write freely', async status => {
      await expect(guard.canActivate(context({ firmRole: FirmRole.LAWYER, subscriptionStatus: status }, 'PATCH'))).resolves.toBe(true);
      expect(reflector.getAllAndOverride).not.toHaveBeenCalled();
    });
  });

  it("a firm-A user is refused on firm B's subdomain", async () => {
    await expect(guard.canActivate(context({ firmId: 'A', firmRole: FirmRole.LAWYER }, 'GET', 'B'))).rejects.toThrow(ForbiddenException);
  });

  it('a user on their own subdomain, or on the apex, passes', async () => {
    await expect(guard.canActivate(context({ firmId: 'A', firmRole: FirmRole.LAWYER }, 'GET', 'A'))).resolves.toBe(true);
    await expect(guard.canActivate(context({ firmId: 'A', firmRole: FirmRole.LAWYER }, 'GET', null))).resolves.toBe(true);
  });

  it('an invalid token still fails as before', async () => {
    passport.mockRejectedValue(new Error('Unauthorized'));
    await expect(guard.canActivate(context(undefined))).rejects.toThrow('Unauthorized');
  });
});

