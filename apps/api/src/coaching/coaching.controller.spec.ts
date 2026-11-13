import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FirmRole } from '@lawfirm/shared';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';
import { CoachingController } from './coaching.controller';
import { StandupController } from './standup.controller';

const managers = ['draft', 'save', 'list', 'member'] as const;
function context(cls: Function, handler: Function, firmRole: FirmRole) {
  return { getClass: () => cls, getHandler: () => handler, switchToHttp: () => ({ getRequest: () => ({ user: { firmRole } }) }) } as any;
}
describe('Coaching / standup authorization', () => {
  const guard = new FirmRoleGuard(new Reflector());
  it.each([CoachingController, StandupController])('%p requires JWT and firm role guards', (controller) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([JwtAuthGuard, FirmRoleGuard]);
  });
  it.each([...managers.map((name) => [CoachingController, CoachingController.prototype[name]] as const), [StandupController, StandupController.prototype.history] as const])('protects every manager endpoint on %p', (cls, handler) => {
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler)).toBe('runOperations');
    for (const role of [FirmRole.OWNER, FirmRole.OFFICE_MANAGER]) expect(guard.canActivate(context(cls, handler, role))).toBe(true);
    for (const role of [FirmRole.LAWYER, FirmRole.SENIOR_LAWYER, FirmRole.ASSISTANT, FirmRole.EXTERNAL]) expect(() => guard.canActivate(context(cls, handler, role))).toThrow('Insufficient permissions');
  });
  it('keeps self-service routes open to firm members', () => {
    for (const handler of [CoachingController.prototype.mine, CoachingController.prototype.acknowledge, StandupController.prototype.today, StandupController.prototype.upsert, StandupController.prototype.skip]) {
      expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, handler)).toBeUndefined();
      expect(guard.canActivate(context(CoachingController, handler, FirmRole.LAWYER))).toBe(true);
    }
  });
  it('throttles only the on-demand AI button', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', CoachingController.prototype.draft)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', CoachingController.prototype.draft)).toBe(60000);
  });
  it('delegates the validated request identity and body to services', async () => {
    const service = { draft: jest.fn(), save: jest.fn(), list: jest.fn(), member: jest.fn(), mine: jest.fn(), acknowledge: jest.fn() };
    const controller = new CoachingController(service as never); const user = { id: 'u1', firmId: 'f1' } as any;
    controller.draft(user, { userId: 'u2' }); controller.acknowledge(user, 'n1', { reply: 'รับทราบ' });
    expect(service.draft).toHaveBeenCalledWith(user, 'u2'); expect(service.acknowledge).toHaveBeenCalledWith(user, 'n1', 'รับทราบ');
  });
});
