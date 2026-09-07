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
    documentDateSuggestion: { createMany: jest.fn() },
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

    it('matches firm-wide rules and rules for the case type only', async () => {
      await service.applyTrigger(context);

      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        where: {
          firmId: 'firm-1',
          trigger: DeadlineTrigger.JUDGMENT,
          isActive: true,
          OR: [{ caseTypeId: null }, { caseTypeId: 'ct-1' }],
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
  });

  describe('provisionDefaults', () => {
    it('seeds starter rules for a firm that has none', async () => {
      await service.provisionDefaults('firm-1');

      const { data } = mockPrisma.deadlineRule.createMany.mock.calls[0][0];
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((r: { firmId: string }) => r.firmId === 'firm-1')).toBe(true);
      expect(data).toContainEqual(
        expect.objectContaining({ trigger: DeadlineTrigger.JUDGMENT, label: 'ยื่นอุทธรณ์' }),
      );
    });

    it('leaves a firm that already has rules alone', async () => {
      mockPrisma.deadlineRule.count.mockResolvedValue(2);

      await service.provisionDefaults('firm-1');

      expect(mockPrisma.deadlineRule.createMany).not.toHaveBeenCalled();
    });
  });

  describe('rule management', () => {
    it('scopes a rule update to the caller firm', async () => {
      mockPrisma.deadlineRule.updateMany.mockResolvedValue({ count: 1 });

      await service.update(user, 'rule-1', { offsetDays: 15 });

      expect(mockPrisma.deadlineRule.updateMany).toHaveBeenCalledWith({
        where: { id: 'rule-1', firmId: 'firm-1' },
        data: { offsetDays: 15 },
      });
    });

    it('reports a miss when the rule belongs to another firm', async () => {
      mockPrisma.deadlineRule.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.update(user, 'rule-x', { offsetDays: 15 })).rejects.toThrow(
        'Deadline rule not found',
      );
    });
  });
});
