import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role, FirmRole } from '@lawfirm/shared';

describe('DocumentsController role restrictions', () => {
  let controller: DocumentsController;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        { provide: DocumentsService, useValue: {} },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DocumentsController);
    reflector = module.get(Reflector);
  });

  it('requires ADMIN role (singular) on upload', () => {
    const roles = reflector.get(ROLES_KEY, controller.upload);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('requires ADMIN role (singular) on uploadVersion', () => {
    const roles = reflector.get(ROLES_KEY, controller.uploadVersion);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('requires ADMIN role (singular) on updateVisibility', () => {
    const roles = reflector.get(ROLES_KEY, controller.updateVisibility);
    expect(roles).toEqual([Role.ADMIN]);
  });

  it('does NOT require a specific role on findByCase (read-only)', () => {
    const roles = reflector.get(ROLES_KEY, controller.findByCase);
    expect(roles).toBeUndefined();
  });
});

describe('DocumentsController RolesGuard outcome', () => {
  const guard = new RolesGuard(new Reflector());

  function buildContext(handler: (...args: any[]) => unknown, user: Record<string, unknown>) {
    return {
      getHandler: () => handler,
      getClass: () => DocumentsController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
  }

  it('denies a non-owner LAWYER on upload', () => {
    const context = buildContext(DocumentsController.prototype.upload, {
      role: Role.LAWYER,
      firmRole: FirmRole.ASSISTANT,
    });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows an ADMIN on upload', () => {
    const context = buildContext(DocumentsController.prototype.upload, {
      role: Role.ADMIN,
      firmRole: FirmRole.ASSISTANT,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a firm OWNER on upload regardless of professional role', () => {
    const context = buildContext(DocumentsController.prototype.upload, {
      role: Role.LAWYER,
      firmRole: FirmRole.OWNER,
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
