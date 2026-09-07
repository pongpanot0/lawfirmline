import { Test, TestingModule } from '@nestjs/testing';
import { PublicHolidaysService } from './public-holidays.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PublicHolidaysService', () => {
  let service: PublicHolidaysService;
  const mockPrisma = {
    publicHoliday: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.publicHoliday.findMany.mockResolvedValue([]);
    mockPrisma.publicHoliday.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.publicHoliday.deleteMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicHolidaysService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(PublicHolidaysService);
  });

  it('lists a Gregorian year as whole Bangkok days', async () => {
    await service.list(2026);

    expect(mockPrisma.publicHoliday.findMany).toHaveBeenCalledWith({
      where: {
        date: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lt: new Date('2027-01-01T00:00:00.000Z'),
        },
      },
      orderBy: { date: 'asc' },
    });
  });

  it('accepts a Buddhist year and converts it', async () => {
    await service.list(2569);

    const { where } = mockPrisma.publicHoliday.findMany.mock.calls[0][0];
    expect(where.date.gte).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('stores an imported date at UTC midnight so it cannot drift a day', async () => {
    await service.importMany([{ date: '2026-12-10', name: 'วันรัฐธรรมนูญ' }]);

    expect(mockPrisma.publicHoliday.createMany).toHaveBeenCalledWith({
      data: [{ date: new Date('2026-12-10T00:00:00.000Z'), name: 'วันรัฐธรรมนูญ' }],
      skipDuplicates: true,
    });
  });

  it('rejects a date that is not a plain calendar day', async () => {
    await expect(
      service.importMany([{ date: '10/12/2026', name: 'x' }]),
    ).rejects.toThrow('Invalid holiday date');
    expect(mockPrisma.publicHoliday.createMany).not.toHaveBeenCalled();
  });

  it('replaces a year in one step so a re-import cannot leave stale dates behind', async () => {
    await service.replaceYear(2569, [{ date: '2026-01-01', name: 'วันขึ้นปีใหม่' }]);

    expect(mockPrisma.publicHoliday.deleteMany).toHaveBeenCalledWith({
      where: {
        date: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lt: new Date('2027-01-01T00:00:00.000Z'),
        },
      },
    });
    expect(mockPrisma.publicHoliday.createMany).toHaveBeenCalled();
  });
});
