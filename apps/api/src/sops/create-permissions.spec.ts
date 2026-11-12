import { FirmRole } from '@lawfirm/shared';
import { FIRM_ROLES_KEY, REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';
import { SopsController } from './sops.controller';
import { WorkflowsController } from '../workflows/workflows.controller';

const roles = (fn: unknown) => Reflect.getMetadata(FIRM_ROLES_KEY, fn as object) as FirmRole[];
const members = [FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER, FirmRole.LAWYER, FirmRole.ASSISTANT];

describe('who may create handbooks and handoff flows', () => {
  it('every member except external freelancers may create a SOP; editing keeps the content-manager gate', () => {
    expect(roles(SopsController.prototype.create)).toEqual(members);
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, SopsController.prototype.create)).toBeUndefined();
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, SopsController.prototype.update)).toBe('manageFirmContent');
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, SopsController.prototype.remove)).toBe('manageFirmContent');
  });
  it('every member except external may create a workflow template; editing stays OWNER/SENIOR', () => {
    expect(roles(WorkflowsController.prototype.createTemplate)).toEqual(members);
    expect(roles(WorkflowsController.prototype.updateTemplate)).toEqual([FirmRole.OWNER, FirmRole.SENIOR_LAWYER]);
  });
});
