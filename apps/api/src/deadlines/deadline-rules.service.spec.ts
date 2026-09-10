import { Test, TestingModule } from '@nestjs/testing';
import { DeadlineDayBasis, DeadlineTrigger, FirmRole } from '@lawfirm/shared';
import { DeadlineRulesService } from './deadline-rules.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DeadlineRulesService', () => {
  let service: DeadlineRulesService;
  const mockPrisma = {
    deadlineRule: {
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    publicHoliday: { findMany: jest.fn() },
    documentDateSuggestion: { findMany: jest.fn(), createMany: jest.fn() },
  };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;

  const rule = {
    id: 'rule-1',
    firmId: 'firm-1',
    caseTypeId: null,
    trigger: DeadlineTrigger.JUDGMENT,
    label: 'ยื่นอุทธรณ์',
    offsetDays: 30,
    dayBasis: DeadlineDayBasis.CALENDAR,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.deadlineRule.findMany.mockResolvedValue([]);
    mockPrisma.deadlineRule.count.mockResolvedValue(0);
    mockPrisma.deadlineRule.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.publicHoliday.findMany.mockResolvedValue([]);
    mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
    mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeadlineRulesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(DeadlineRulesService);
  });

  describe('computeDueDate', () => {
    // Fri 2026-09-04 is the trigger day in all of these.
    const trigger = new Date('2026-09-04T03:00:00Z');

    it('counts calendar days from the trigger', () => {
      // +4 calendar days = Tue 2026-09-08.
      expect(service.computeDueDate(trigger, 4, DeadlineDayBasis.CALENDAR, new Set())).toBe(
        '2026-09-08',
      );
    });

    it('rolls a calendar deadline off a weekend onto the next working day', () => {
      // +1 = Sat 5 Sep → Mon 7 Sep.
      expect(service.computeDueDate(trigger, 1, DeadlineDayBasis.CALENDAR, new Set())).toBe(
        '2026-09-07',
      );
    });

    it('rolls a calendar deadline off a public holiday', () => {
      // +4 = Tue 8 Sep, declared a holiday → Wed 9 Sep.
      expect(
        service.computeDueDate(trigger, 4, DeadlineDayBasis.CALENDAR, new Set(['2026-09-08'])),
      ).toBe('2026-09-09');
    });

    it('skips weekends while counting business days', () => {
      // Fri +1 business day = Mon 7 Sep (Sat/Sun do not count).
      expect(service.computeDueDate(trigger, 1, DeadlineDayBasis.BUSINESS, new Set())).toBe(
        '2026-09-07',
      );
      // Fri +3 business days = Wed 9 Sep.
      expect(service.computeDueDate(trigger, 3, DeadlineDayBasis.BUSINESS, new Set())).toBe(
        '2026-09-09',
      );
    });

    it('skips public holidays while counting business days', () => {
      // Mon 7 Sep is a holiday, so Fri +1 business day lands on Tue 8 Sep.
      expect(
        service.computeDueDate(trigger, 1, DeadlineDayBasis.BUSINESS, new Set(['2026-09-07'])),
      ).toBe('2026-09-08');
    });

    it('uses the Bangkok day of the trigger, not the UTC day', () => {
      // 2026-09-04T18:00Z is already Sat 5 Sep in Bangkok; +2 calendar days is
      // Mon 7 Sep, and it must not be counted from Fri 4 Sep.
      expect(
        service.computeDueDate(new Date('2026-09-04T18:00:00Z'), 2, DeadlineDayBasis.CALENDAR, new Set()),
      ).toBe('2026-09-07');
    });
  });

  describe('computeDueDate with the seeded 2569 calendar', () => {
    // The dates the 20260907190000 migration inserts, as the engine sees them.
    const holidays2569 = new Set([
      '2026-01-01', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15',
      '2026-05-04', '2026-05-13', '2026-05-31', '2026-06-01', '2026-06-03', '2026-07-28',
      '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13', '2026-10-23', '2026-12-05',
      '2026-12-07', '2026-12-10', '2026-12-31',
    ]);
    const at = (day: string) => new Date(`${day}T03:00:00Z`);

    it('pushes a deadline that would land inside Songkran to the first working day after', () => {
      // 30 Mar + 15 calendar days = 14 Apr, inside the 13–15 Apr holiday.
      expect(
        service.computeDueDate(at('2026-03-30'), 15, DeadlineDayBasis.CALENDAR, holidays2569),
      ).toBe('2026-04-16');
    });

    it('does not spend Songkran or a weekend when counting business days', () => {
      // From Fri 10 Apr the next working days are 16, 17 and 20 Apr.
      expect(
        service.computeDueDate(at('2026-04-10'), 3, DeadlineDayBasis.BUSINESS, holidays2569),
      ).toBe('2026-04-20');
    });

    it('clears a holiday, its weekend and the substitute day in one run', () => {
      // 5 Nov + 30 = Sat 5 Dec (holiday), Sun 6th, substitute Mon 7th → Tue 8th.
      expect(
        service.computeDueDate(at('2026-11-05'), 30, DeadlineDayBasis.CALENDAR, holidays2569),
      ).toBe('2026-12-08');
    });

    it('clears a Sunday holiday and its Monday substitute', () => {
      // 1 May + 30 = Sun 31 May (Visakha Bucha), substitute Mon 1 Jun → Tue 2 Jun.
      expect(
        service.computeDueDate(at('2026-05-01'), 30, DeadlineDayBasis.CALENDAR, holidays2569),
      ).toBe('2026-06-02');
    });
  });

  describe('applyTrigger', () => {
    const context = {
      caseId: 'case-1',
      firmId: 'firm-1',
      caseTypeId: 'ct-1',
      trigger: DeadlineTrigger.JUDGMENT,
      triggerDate: new Date('2026-09-04T03:00:00Z'),
      triggerEventId: 'evt-1',
      createdById: 'user-1',
    };

    it('raises a suggestion per matching rule instead of writing the calendar', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      const created = await service.applyTrigger(context);

      expect(created).toBe(1);
      const { data, skipDuplicates } = mockPrisma.documentDateSuggestion.createMany.mock.calls[0][0];
      expect(skipDuplicates).toBe(true);
      expect(data).toEqual([
        expect.objectContaining({
          caseId: 'case-1',
          label: 'ยื่นอุทธรณ์',
          source: 'RULE',
          eventType: 'DEADLINE',
          status: 'PENDING',
          deadlineRuleId: 'rule-1',
          triggerEventId: 'evt-1',
          createdById: 'user-1',
          sourceExcerpt: null,
        }),
      ]);
      // 2026-10-04 is a Sunday, so the deadline rolls to Mon 5 Oct.
      expect(data[0].suggestedDate.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    });

    it('matches global platform rules for the trigger', async () => {
      await service.applyTrigger(context);

      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        where: {
          trigger: DeadlineTrigger.JUDGMENT,
          isActive: true,
          caseTypeId: null,
        },
      });
    });

    it('does nothing when the firm has no rule for the trigger', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([]);
    mockPrisma.deadlineRule.count.mockResolvedValue(0);
    mockPrisma.deadlineRule.createMany.mockResolvedValue({ count: 0 });

      const created = await service.applyTrigger(context);

      expect(created).toBe(0);
      expect(mockPrisma.documentDateSuggestion.createMany).not.toHaveBeenCalled();
    });

    it('skips rules that already have a PENDING suggestion for a manual trigger', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([{ deadlineRuleId: 'rule-1' }]);

      const created = await service.applyTrigger({ ...context, triggerEventId: null });

      expect(created).toBe(0);
      expect(mockPrisma.documentDateSuggestion.findMany).toHaveBeenCalledWith({
        where: {
          caseId: 'case-1',
          status: 'PENDING',
          source: 'RULE',
          deadlineRuleId: { in: ['rule-1'] },
          triggerEventId: null,
        },
        select: { deadlineRuleId: true },
      });
      expect(mockPrisma.documentDateSuggestion.createMany).not.toHaveBeenCalled();
    });

    it('still creates when a prior suggestion was dismissed', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      const created = await service.applyTrigger({ ...context, triggerEventId: null });

      expect(created).toBe(1);
      expect(mockPrisma.documentDateSuggestion.createMany).toHaveBeenCalled();
    });
  });

  describe('provisionDefaults', () => {
    it('seeds starter rules when the catalog is empty', async () => {
      await service.provisionDefaults();

      const { data } = mockPrisma.deadlineRule.createMany.mock.calls[0][0];
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((r: { firmId?: string }) => r.firmId === undefined)).toBe(true);
      expect(data).toContainEqual(
        expect.objectContaining({ trigger: DeadlineTrigger.JUDGMENT, label: 'ยื่นอุทธรณ์' }),
      );
    });

    it('leaves an existing catalog alone', async () => {
      mockPrisma.deadlineRule.count.mockResolvedValue(2);

      await service.provisionDefaults();

      expect(mockPrisma.deadlineRule.createMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('provisions the starter rules when the catalog is empty', async () => {
      await service.list(user);

      expect(mockPrisma.deadlineRule.createMany).toHaveBeenCalled();
      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        orderBy: [{ trigger: 'asc' }, { offsetDays: 'asc' }],
      });
    });

    it('does not re-seed when rules already exist', async () => {
      mockPrisma.deadlineRule.count.mockResolvedValue(4);

      await service.list(user);

      expect(mockPrisma.deadlineRule.createMany).not.toHaveBeenCalled();
    });
  });

  describe('rule management', () => {
    it('updates a global rule by id', async () => {
      mockPrisma.deadlineRule.updateMany.mockResolvedValue({ count: 1 });

      await service.update(user, 'rule-1', { offsetDays: 15 });

      expect(mockPrisma.deadlineRule.updateMany).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { offsetDays: 15, caseTypeId: null },
      });
    });

    it('reports a miss when the rule does not exist', async () => {
      mockPrisma.deadlineRule.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.update(user, 'rule-x', { offsetDays: 15 })).rejects.toThrow(
        'Deadline rule not found',
      );
    });
  });
});
