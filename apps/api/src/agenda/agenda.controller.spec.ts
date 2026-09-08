import { Test, TestingModule } from '@nestjs/testing';
import { FirmRole } from '@lawfirm/shared';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('AgendaController', () => {
  let controller: AgendaController;
  const mockService = { getMyDay: jest.fn(), getAgenda: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgendaController],
      providers: [{ provide: AgendaService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AgendaController);
  });

  it('scopes my-day to the caller', () => {
    controller.getMyDay(user);
    expect(mockService.getMyDay).toHaveBeenCalledWith(user);
  });

  it('passes the range through as real dates', () => {
    controller.getRange(user, { from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' });

    const [caller, from, to] = mockService.getAgenda.mock.calls[0];
    expect(caller).toBe(user);
    expect(from).toEqual(new Date('2026-09-07T00:00:00Z'));
    expect(to).toEqual(new Date('2026-09-14T00:00:00Z'));
  });
});
