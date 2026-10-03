import { ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FirmRole } from '@lawfirm/shared';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Runs the real canActivate with passport's own check stubbed to "token valid". */
describe('JwtAuthGuard', () => {
  const passport = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate');
  const context = (user: unknown) => {
    const req = { user };
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

  it('an invalid token still fails as before', async () => {
    passport.mockRejectedValue(new Error('Unauthorized'));
    await expect(guard.canActivate(context(undefined))).rejects.toThrow('Unauthorized');
  });
});
