import { ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard, platformAdminEmails } from './platform-admin.guard';

const ctx = (user: unknown) => ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

describe('PlatformAdminGuard', () => {
  const saved = process.env.PLATFORM_ADMIN_EMAILS;
  afterEach(() => { process.env.PLATFORM_ADMIN_EMAILS = saved; });

  it('a firm OWNER with the ADMIN role is not a platform admin', () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@samnuan.com';
    expect(() => new PlatformAdminGuard().canActivate(ctx({ email: 'owner@firm.com', role: 'ADMIN', firmRole: 'OWNER' })))
      .toThrow(ForbiddenException);
  });

  it('listed operators pass, case-insensitively', () => {
    process.env.PLATFORM_ADMIN_EMAILS = ' Ops@Samnuan.com , x@y.z';
    expect(new PlatformAdminGuard().canActivate(ctx({ email: 'ops@samnuan.com' }))).toBe(true);
  });

  it('nobody passes when the list is unset', () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    expect(platformAdminEmails().size).toBe(0);
    expect(() => new PlatformAdminGuard().canActivate(ctx({ email: 'ops@samnuan.com' }))).toThrow(ForbiddenException);
  });
});
