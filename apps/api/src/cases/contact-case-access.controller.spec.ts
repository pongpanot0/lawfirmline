import { Test, TestingModule } from '@nestjs/testing';
import { ContactCaseAccessController } from './contact-case-access.controller';
import { ContactCaseAccessService } from './contact-case-access.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

describe('ContactCaseAccessController', () => {
  let controller: ContactCaseAccessController;
  const mockService = {
    grant: jest.fn(),
    revoke: jest.fn(),
    listForCase: jest.fn(),
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactCaseAccessController],
      providers: [{ provide: ContactCaseAccessService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ContactCaseAccessController);
  });

  it('delegates list to service.listForCase', async () => {
    mockService.listForCase.mockResolvedValue([{ id: 'access-1' }]);
    const result = await controller.list(user, 'case-1');
    expect(mockService.listForCase).toHaveBeenCalledWith(user, 'case-1');
    expect(result).toEqual([{ id: 'access-1' }]);
  });

  it('delegates grant to service.grant', async () => {
    const dto = { clientContactId: 'contact-1' };
    mockService.grant.mockResolvedValue({ id: 'access-1' });
    const result = await controller.grant(user, 'case-1', dto as any);
    expect(mockService.grant).toHaveBeenCalledWith(user, 'case-1', dto);
    expect(result).toEqual({ id: 'access-1' });
  });

  it('delegates revoke to service.revoke', async () => {
    mockService.revoke.mockResolvedValue({ id: 'access-1', revokedAt: new Date() });
    const result = await controller.revoke(user, 'case-1', 'access-1');
    expect(mockService.revoke).toHaveBeenCalledWith(user, 'case-1', 'access-1');
    expect(result).toEqual(expect.objectContaining({ id: 'access-1' }));
  });
});
