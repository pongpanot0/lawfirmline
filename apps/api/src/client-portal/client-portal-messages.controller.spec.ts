import { Test, TestingModule } from '@nestjs/testing';
import { ClientPortalMessagesController } from './client-portal-messages.controller';
import { CaseMessageService } from '../cases/case-message.service';
import { ClientPortalGuard } from './client-portal.guard';

describe('ClientPortalMessagesController', () => {
  let controller: ClientPortalMessagesController;
  const mockService = { listForPortal: jest.fn(), createFromPortal: jest.fn() };
  const portalUser = { clientContactId: 'contact-1', clientId: 'client-1', firmId: 'firm-1', name: 'x', email: 'x@x.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientPortalMessagesController],
      providers: [{ provide: CaseMessageService, useValue: mockService }],
    })
      .overrideGuard(ClientPortalGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ClientPortalMessagesController);
  });

  it('delegates list to service.listForPortal', async () => {
    mockService.listForPortal.mockResolvedValue([{ id: 'msg-1' }]);
    const result = await controller.list(portalUser, 'case-1');
    expect(mockService.listForPortal).toHaveBeenCalledWith(portalUser, 'case-1');
    expect(result).toEqual([{ id: 'msg-1' }]);
  });

  it('delegates create to service.createFromPortal', async () => {
    mockService.createFromPortal.mockResolvedValue({ id: 'msg-1' });
    const result = await controller.create(portalUser, 'case-1', { body: 'hi' });
    expect(mockService.createFromPortal).toHaveBeenCalledWith(portalUser, 'case-1', 'hi');
    expect(result).toEqual({ id: 'msg-1' });
  });
});
