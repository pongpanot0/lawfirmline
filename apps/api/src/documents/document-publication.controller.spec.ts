import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DocumentPublicationController } from './document-publication.controller';
import { DocumentPublicationService } from './document-publication.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { FirmRoleGuard } from '../saas/guards/firm-role.guard';
import { ForbiddenException } from '@nestjs/common';
import { Role, FirmRole } from '@lawfirm/shared';

describe('DocumentPublicationController', () => {
  let controller: DocumentPublicationController;
  const mockService = { publish: jest.fn(), unpublish: jest.fn(), listForDocument: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentPublicationController],
      providers: [{ provide: DocumentPublicationService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(FirmRoleGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DocumentPublicationController);
  });

  it('delegates list to service.listForDocument', async () => {
    mockService.listForDocument.mockResolvedValue([{ id: 'pub-1' }]);
    const result = await controller.list(user, 'case-1', 'doc-1');
    expect(mockService.listForDocument).toHaveBeenCalledWith(user, 'case-1', 'doc-1');
    expect(result).toEqual([{ id: 'pub-1' }]);
  });

  it('delegates publish to service.publish', async () => {
    const dto = { title: 'สรุปคดี' };
    mockService.publish.mockResolvedValue({ id: 'pub-1' });
    const result = await controller.publish(user, 'case-1', 'doc-1', dto as any);
    expect(mockService.publish).toHaveBeenCalledWith(user, 'case-1', 'doc-1', dto);
    expect(result).toEqual({ id: 'pub-1' });
  });

  it('delegates unpublish to service.unpublish', async () => {
    mockService.unpublish.mockResolvedValue({ id: 'pub-1', unpublishedAt: new Date() });
    const result = await controller.unpublish(user, 'case-1', 'doc-1', 'pub-1');
    expect(mockService.unpublish).toHaveBeenCalledWith(user, 'case-1', 'doc-1', 'pub-1');
    expect(result).toEqual(expect.objectContaining({ id: 'pub-1' }));
  });
});

describe('DocumentPublicationController FirmRoleGuard outcome', () => {
  const guard = new FirmRoleGuard(new Reflector());

  function buildContext(handler: (...args: any[]) => unknown, reqUser: Record<string, unknown>) {
    return {
      getHandler: () => handler,
      getClass: () => DocumentPublicationController,
      switchToHttp: () => ({ getRequest: () => ({ user: reqUser }) }),
    } as any;
  }

  it('denies a non-owner LAWYER on publish', () => {
    const context = buildContext(DocumentPublicationController.prototype.publish, {
      role: Role.LAWYER,
      firmRole: FirmRole.ASSISTANT,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies a non-owner LAWYER on unpublish', () => {
    const context = buildContext(DocumentPublicationController.prototype.unpublish, {
      role: Role.LAWYER,
      firmRole: FirmRole.ASSISTANT,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies a legacy professional-ADMIN who is not a firm owner or office manager', () => {
    const context = buildContext(DocumentPublicationController.prototype.publish, {
      role: Role.ADMIN,
      firmRole: FirmRole.ASSISTANT,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows an OFFICE_MANAGER on publish', () => {
    const context = buildContext(DocumentPublicationController.prototype.publish, {
      role: Role.LAWYER,
      firmRole: FirmRole.OFFICE_MANAGER,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a firm OWNER on publish regardless of professional role', () => {
    const context = buildContext(DocumentPublicationController.prototype.publish, {
      role: Role.LAWYER,
      firmRole: FirmRole.OWNER,
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
