import { Test, TestingModule } from '@nestjs/testing';
import { CaseMessageController } from './case-message.controller';
import { CaseMessageService } from './case-message.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CaseAccessGuard } from '../common/guards/case-access.guard';

describe('CaseMessageController', () => {
  let controller: CaseMessageController;
  const mockService = { listForStaff: jest.fn(), createFromStaff: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CaseMessageController],
      providers: [{ provide: CaseMessageService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CaseAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CaseMessageController);
  });

  it('delegates list to service.listForStaff', async () => {
    mockService.listForStaff.mockResolvedValue([{ id: 'msg-1' }]);
    const result = await controller.list(user, 'case-1');
    expect(mockService.listForStaff).toHaveBeenCalledWith(user, 'case-1');
    expect(result).toEqual([{ id: 'msg-1' }]);
  });

  it('delegates create to service.createFromStaff', async () => {
    mockService.createFromStaff.mockResolvedValue({ id: 'msg-1' });
    const result = await controller.create(user, 'case-1', { body: 'hello' });
    expect(mockService.createFromStaff).toHaveBeenCalledWith(user, 'case-1', 'hello');
    expect(result).toEqual({ id: 'msg-1' });
  });
});
