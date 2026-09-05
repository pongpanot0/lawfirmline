import { Test, TestingModule } from '@nestjs/testing';
import { DocumentPublicationController } from './document-publication.controller';
import { DocumentPublicationService } from './document-publication.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { RolesGuard } from '../common/guards/roles.guard';

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
      .overrideGuard(RolesGuard)
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
