import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirmRole } from '@lawfirm/shared';
import { JwtStrategy } from './jwt.strategy';
import { SessionService } from './session.service';
import { TenantService } from '../saas/tenant.service';

describe('JwtStrategy', () => {
  const user = { id: 'u1', firmId: 'f1' };
  const payload = { sub: 'u1', email: 'a@b.test', firmId: 'f1', firmRole: FirmRole.OWNER };

  function strategy(active: boolean) {
    const tenant = { buildAuthUser: jest.fn().mockResolvedValue(user) } as unknown as TenantService;
    const sessions = { isActive: jest.fn().mockResolvedValue(active) } as unknown as SessionService;
    return new JwtStrategy(new ConfigService({ JWT_SECRET: 's' }), tenant, sessions);
  }

  it('rejects an access token whose session was logged out', async () => {
    await expect(strategy(false).validate({ ...payload, jti: 'gone' })).rejects.toThrow(UnauthorizedException);
  });

  it('accepts an access token of a live session', async () => {
    await expect(strategy(true).validate({ ...payload, jti: 'live' })).resolves.toBe(user);
  });
});
