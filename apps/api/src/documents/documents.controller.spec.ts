import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '@lawfirm/shared';

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

  it('requires ADMIN or LAWYER role on upload', () => {
    const roles = reflector.get(ROLES_KEY, controller.upload);
    expect(roles).toEqual([Role.ADMIN, Role.LAWYER]);
  });

  it('requires ADMIN or LAWYER role on uploadVersion', () => {
    const roles = reflector.get(ROLES_KEY, controller.uploadVersion);
    expect(roles).toEqual([Role.ADMIN, Role.LAWYER]);
  });

  it('requires ADMIN or LAWYER role on updateVisibility', () => {
    const roles = reflector.get(ROLES_KEY, controller.updateVisibility);
    expect(roles).toEqual([Role.ADMIN, Role.LAWYER]);
  });

  it('does NOT require a specific role on findByCase (read-only)', () => {
    const roles = reflector.get(ROLES_KEY, controller.findByCase);
    expect(roles).toBeUndefined();
  });
});
