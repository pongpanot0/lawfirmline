import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirmRole } from '@lawfirm/shared';
import { FirmRoleGuard } from './firm-role.guard';
import { REQUIRE_CAPABILITY_KEY } from '../decorators/saas.decorators';

function ctx(firmRole: FirmRole): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', firmId: 'f', firmRole } }) }),
  } as any;
}

describe('FirmRoleGuard capability', () => {
  const reflector = new Reflector();
  const guard = new FirmRoleGuard(reflector);

  function withMeta(meta: Record<string, unknown>) {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => meta[key]);
  }

  it('allows OFFICE_MANAGER on an office capability', () => {
    withMeta({ [REQUIRE_CAPABILITY_KEY]: 'manageInvoices' });
    expect(guard.canActivate(ctx(FirmRole.OFFICE_MANAGER))).toBe(true);
  });

  it('blocks OFFICE_MANAGER on an owner capability', () => {
    withMeta({ [REQUIRE_CAPABILITY_KEY]: 'approveExpenses' });
    expect(() => guard.canActivate(ctx(FirmRole.OFFICE_MANAGER))).toThrow(ForbiddenException);
  });

  it('blocks LAWYER on an office capability', () => {
    withMeta({ [REQUIRE_CAPABILITY_KEY]: 'manageInvoices' });
    expect(() => guard.canActivate(ctx(FirmRole.LAWYER))).toThrow(ForbiddenException);
  });

  it('still enforces @OwnerOnly for OFFICE_MANAGER', () => {
    withMeta({ ownerOnly: true });
    expect(() => guard.canActivate(ctx(FirmRole.OFFICE_MANAGER))).toThrow(ForbiddenException);
  });
});
