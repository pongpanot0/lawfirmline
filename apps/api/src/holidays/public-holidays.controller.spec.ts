import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { Role } from '@lawfirm/shared';
import { PublicHolidaysController } from './public-holidays.controller';
import { PublicHolidaysService } from './public-holidays.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('PublicHolidaysController', () => {
  let controller: PublicHolidaysController;
  let reflector: Reflector;
  const mockService = {
    list: jest.fn(),
    importMany: jest.fn(),
    replaceYear: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicHolidaysController],
      providers: [{ provide: PublicHolidaysService, useValue: mockService }, Reflector],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PublicHolidaysController);
    reflector = module.get(Reflector);
  });

  it('is readable by any member, writable only by an admin', () => {
    expect(reflector.get(ROLES_KEY, controller.list)).toBeUndefined();
    for (const handler of [controller.add, controller.replaceYear, controller.remove]) {
      expect(reflector.get(ROLES_KEY, handler)).toEqual([Role.ADMIN]);
    }
  });

  it('reads the year as a number, and omits it when not given', () => {
    controller.list('2569');
    expect(mockService.list).toHaveBeenCalledWith(2569);

    controller.list(undefined);
    expect(mockService.list).toHaveBeenLastCalledWith(undefined);
  });

  it('adds a single holiday through the same import path', () => {
    controller.add({ date: '2026-12-10', name: 'วันรัฐธรรมนูญ' });
    expect(mockService.importMany).toHaveBeenCalledWith([
      { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' },
    ]);
  });

  it('replaces a whole year in one call', () => {
    const holidays = [{ date: '2027-01-01', name: 'วันขึ้นปีใหม่' }];
    controller.replaceYear({ year: 2570, holidays });
    expect(mockService.replaceYear).toHaveBeenCalledWith(2570, holidays);
  });
});
