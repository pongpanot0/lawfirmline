import { ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { FIRM_ROLES_KEY, REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';
import { SopsController } from './sops.controller';
import { SopsService } from './sops.service';
import { WorkflowsController } from '../workflows/workflows.controller';

const roles = (fn: unknown) => Reflect.getMetadata(FIRM_ROLES_KEY, fn as object) as FirmRole[];
const members = [FirmRole.OWNER, FirmRole.SENIOR_LAWYER, FirmRole.OFFICE_MANAGER, FirmRole.LAWYER, FirmRole.ASSISTANT];

describe('who may create and manage handbooks and handoff flows', () => {
  it('every member except external may reach create/edit/delete; the services decide whose item it is', () => {
    for (const fn of [SopsController.prototype.create, SopsController.prototype.update, SopsController.prototype.remove,
      WorkflowsController.prototype.createTemplate, WorkflowsController.prototype.updateTemplate, WorkflowsController.prototype.deleteTemplate]) {
      expect(roles(fn)).toEqual(members);
      expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, fn)).toBeUndefined();
    }
  });
  describe('SopsService: authors edit their own, content managers edit any', () => {
    const sop = (createdById: string | null) => ({ id: 'sop-1', firmId: 'f1', createdById });
    const make = (row: unknown) => {
      const prisma: any = { sop: { findFirst: jest.fn().mockResolvedValue(row), update: jest.fn().mockResolvedValue({}), delete: jest.fn(), create: jest.fn() } };
      return { svc: new SopsService(prisma), prisma };
    };
    const lawyer = { id: 'u-law', firmId: 'f1', firmRole: FirmRole.LAWYER } as any;
    const manager = { id: 'u-mgr', firmId: 'f1', firmRole: FirmRole.OFFICE_MANAGER } as any;
    it('records the author on create', async () => {
      const { svc, prisma } = make(null);
      await svc.create(lawyer, { title: 't', content: 'c' });
      expect(prisma.sop.create).toHaveBeenCalledWith({ data: expect.objectContaining({ createdById: 'u-law', updatedById: 'u-law' }) });
    });
    it('lets the author edit and delete, refuses others (and legacy rows with no author)', async () => {
      await make(sop('u-law')).svc.update(lawyer, 'sop-1', { title: 'x' });
      await make(sop('u-law')).svc.remove(lawyer, 'sop-1');
      await expect(make(sop('someone')).svc.update(lawyer, 'sop-1', { title: 'x' })).rejects.toThrow(ForbiddenException);
      await expect(make(sop(null)).svc.remove(lawyer, 'sop-1')).rejects.toThrow(ForbiddenException);
    });
    it('content managers still edit anyone\'s handbook', async () => {
      await make(sop('someone')).svc.update(manager, 'sop-1', { title: 'x' });
      await make(sop(null)).svc.remove(manager, 'sop-1');
    });
  });
});
