import { Test, TestingModule } from '@nestjs/testing';
import { CourtEventKind, DeadlineDayBasis, DeadlineTrigger, FirmRole, ServiceMethod } from '@lawfirm/shared';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { DeadlineRulesService } from './deadline-rules.service';
import { PrismaService } from '../prisma/prisma.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateDeadlineRuleDto } from './dto/deadline-rule.dto';

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
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    publicHoliday: { findMany: jest.fn() },
    case: { findUnique: jest.fn() },
    documentDateSuggestion: { findMany: jest.fn(), createMany: jest.fn() },
  };
  const mockNotifier = { notifyAssigned: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;

  const rule = {
    id: 'rule-1',
    firmId: null,
    caseTypeId: null,
    trigger: DeadlineTrigger.JUDGMENT,
    label: 'ยื่นอุทธรณ์',
    offsetDays: 30,
    dayBasis: DeadlineDayBasis.CALENDAR,
    adjustDays: 0,
    courtEventKind: null,
    courtLevel: null,
    partySide: null,
    serviceMethod: null,
    isActive: true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.deadlineRule.findMany.mockResolvedValue([]);
    mockPrisma.deadlineRule.count.mockResolvedValue(0);
    mockPrisma.deadlineRule.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.publicHoliday.findMany.mockResolvedValue([]);
    mockPrisma.case.findUnique.mockResolvedValue({ partyRole: null, courtLevel: null, leadLawyerId: 'lead-1', ownRef: 'C-001' });
    mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
    mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadlineRulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
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

    it('counts MONTHS to the same day of month (11 Oct → 11 Nov)', () => {
      expect(
        service.computeDueDate(new Date('2026-10-11T03:00:00Z'), 1, DeadlineDayBasis.MONTHS, new Set()),
      ).toBe('2026-11-11');
    });

    it('counts MONTHS from the Bangkok day of a late-evening trigger', () => {
      // 18:00Z on 11 Oct is already Mon 12 Oct in Bangkok.
      expect(
        service.computeDueDate(new Date('2026-10-11T18:00:00Z'), 1, DeadlineDayBasis.MONTHS, new Set()),
      ).toBe('2026-11-12');
    });

    it('clamps MONTHS to month end, then rolls a weekend forward', () => {
      // 31 Jan 2027 + 1 month = Sun 28 Feb → Mon 1 Mar.
      expect(
        service.computeDueDate(new Date('2027-01-31T03:00:00Z'), 1, DeadlineDayBasis.MONTHS, new Set()),
      ).toBe('2027-03-01');
    });

    it('rolls a before-trigger deadline BACK off a holiday', () => {
      // Hearing Tue 20 Apr 2027 − 7 = Tue 13 Apr (Songkran) → Mon 12 Apr.
      expect(
        service.computeDueDate(
          new Date('2027-04-20T03:00:00Z'),
          -7,
          DeadlineDayBasis.CALENDAR,
          new Set(['2027-04-13', '2027-04-14', '2027-04-15']),
        ),
      ).toBe('2027-04-12');
    });

    it('rolls a before-trigger deadline BACK off a weekend', () => {
      // Fri 11 Sep 2026 − 6 = Sat 5 Sep → Fri 4 Sep.
      expect(
        service.computeDueDate(new Date('2026-09-11T03:00:00Z'), -6, DeadlineDayBasis.CALENDAR, new Set()),
      ).toBe('2026-09-04');
    });

    it('applies adjustDays after the months and rolls back (10 years − 90 days)', () => {
      expect(
        service.computeDueDate(new Date('2026-10-12T03:00:00Z'), 120, DeadlineDayBasis.MONTHS, new Set(), -90),
      ).toBe('2036-07-14');
      // 11 Oct 2036 − 90 = Sun 13 Jul → Fri 11 Jul.
      expect(
        service.computeDueDate(new Date('2026-10-11T03:00:00Z'), 120, DeadlineDayBasis.MONTHS, new Set(), -90),
      ).toBe('2036-07-11');
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
      // 2026-10-04 is a Sunday, so the deadline rolls to Mon 5 Oct, due at 16:30 Bangkok.
      expect(data[0].suggestedDate.toISOString()).toBe('2026-10-05T09:30:00.000Z');
    });

    it('loads global rules plus the firm’s own rules for the trigger', async () => {
      await service.applyTrigger(context);

      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        where: {
          trigger: DeadlineTrigger.JUDGMENT,
          caseTypeId: null,
          OR: [{ firmId: null }, { firmId: 'firm-1' }],
        },
      });
    });

    it('uses the firm override instead of the global rule', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([
        rule,
        { ...rule, id: 'rule-firm', firmId: 'firm-1', offsetDays: 45 },
      ]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      await service.applyTrigger(context);

      const { data } = mockPrisma.documentDateSuggestion.createMany.mock.calls[0][0];
      expect(data.map((d: { deadlineRuleId: string }) => d.deadlineRuleId)).toEqual(['rule-firm']);
    });

    it('fires the ม.88 witness-list rule only for a witness hearing', async () => {
      const witnessList = {
        ...rule, id: 'rule-88', trigger: DeadlineTrigger.COURT_DATE, label: 'ยื่นบัญชีระบุพยาน',
        offsetDays: -7, courtEventKind: CourtEventKind.WITNESS_HEARING,
      };
      mockPrisma.deadlineRule.findMany.mockResolvedValue([witnessList]);

      const none = await service.applyTrigger({
        ...context, trigger: DeadlineTrigger.COURT_DATE, courtEventKind: CourtEventKind.PRELIMINARY,
      });
      expect(none).toBe(0);
      expect(mockPrisma.documentDateSuggestion.createMany).not.toHaveBeenCalled();

      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });
      await service.applyTrigger({
        ...context, trigger: DeadlineTrigger.COURT_DATE, courtEventKind: CourtEventKind.WITNESS_HEARING,
      });
      expect(mockPrisma.documentDateSuggestion.createMany).toHaveBeenCalledTimes(1);
    });

    it('skips a plaintiff-only rule on a defendant case', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        partyRole: 'DEFENDANT', courtLevel: null, leadLawyerId: 'lead-1', ownRef: 'C-001',
      });
      mockPrisma.deadlineRule.findMany.mockResolvedValue([{ ...rule, partySide: 'PLAINTIFF' }]);

      expect(await service.applyTrigger(context)).toBe(0);
    });

    it('uses the posted-service rule only when the summons was posted', async () => {
      const personal = { ...rule, id: 'r15', trigger: DeadlineTrigger.COMPLAINT_SERVED, offsetDays: 15, serviceMethod: ServiceMethod.PERSONAL };
      const posted = { ...rule, id: 'r30', trigger: DeadlineTrigger.COMPLAINT_SERVED, label: 'ครบกำหนดยื่นคำให้การ (ปิดหมาย)', offsetDays: 30, serviceMethod: ServiceMethod.POSTED };
      mockPrisma.deadlineRule.findMany.mockResolvedValue([personal, posted]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      await service.applyTrigger({ ...context, trigger: DeadlineTrigger.COMPLAINT_SERVED, serviceMethod: ServiceMethod.POSTED });

      const { data } = mockPrisma.documentDateSuggestion.createMany.mock.calls[0][0];
      expect(data.map((d: { deadlineRuleId: string }) => d.deadlineRuleId)).toEqual(['r30']);
    });

    it('tells the lead lawyer how many suggestions wait for confirmation', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 1 });

      await service.applyTrigger(context);

      expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          firmId: 'firm-1',
          userIds: ['lead-1'],
          actorUserId: '',
          category: 'CALENDAR',
          entityPath: '/cases/case-1?tab=calendar',
          summaryText: expect.stringContaining('วันครบกำหนดรอยืนยัน 1 รายการ — คดี C-001'),
        }),
      );
    });

    it('does not notify when nothing new was created', async () => {
      mockPrisma.deadlineRule.findMany.mockResolvedValue([rule]);
      mockPrisma.documentDateSuggestion.createMany.mockResolvedValue({ count: 0 });

      await service.applyTrigger(context);

      expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
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
      expect(data).toHaveLength(11);
      expect(data.every((r: { firmId?: string }) => r.firmId === undefined)).toBe(true);
      expect(data).toContainEqual(
        expect.objectContaining({
          trigger: DeadlineTrigger.JUDGMENT, label: 'ครบกำหนดยื่นอุทธรณ์',
          offsetDays: 1, dayBasis: DeadlineDayBasis.MONTHS, courtLevel: 'TRIAL',
        }),
      );
      expect(data).toContainEqual(
        expect.objectContaining({ label: 'ใกล้ครบระยะบังคับคดี 10 ปี', offsetDays: 120, adjustDays: -90 }),
      );
    });

    it('leaves an existing catalog alone', async () => {
      mockPrisma.deadlineRule.count.mockResolvedValue(2);

      await service.provisionDefaults();

      expect(mockPrisma.deadlineRule.createMany).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const owner = { ...user, email: 'owner@firm.test', firmRole: FirmRole.OWNER };
    const lawyer = { ...user, email: 'lawyer@firm.test', firmRole: FirmRole.LAWYER };

    beforeEach(() => {
      process.env.PLATFORM_ADMIN_EMAILS = 'ops@platform.test';
      mockPrisma.deadlineRule.count.mockResolvedValue(11);
      mockPrisma.deadlineRule.findMany.mockResolvedValue([
        { ...rule, id: 'g', firmId: null },
        { ...rule, id: 'f', firmId: 'firm-1' },
      ]);
    });

    it('returns global rows plus the caller firm rows, flagging what the caller may edit', async () => {
      const rows = await service.list(owner);

      expect(mockPrisma.deadlineRule.findMany).toHaveBeenCalledWith({
        where: { OR: [{ firmId: null }, { firmId: 'firm-1' }] },
        orderBy: [{ trigger: 'asc' }, { offsetDays: 'asc' }],
      });
      expect(rows.map((r) => [r.id, r.canEdit])).toEqual([['g', false], ['f', true]]);
      expect((await service.list(lawyer)).map((r) => r.canEdit)).toEqual([false, false]);
      expect((await service.list({ ...owner, email: 'OPS@platform.test' })).map((r) => r.canEdit)).toEqual([true, true]);
    });

    it('provisions the starter rules when the catalog is empty', async () => {
      mockPrisma.deadlineRule.count.mockResolvedValue(0);
      await service.list(owner);
      expect(mockPrisma.deadlineRule.createMany).toHaveBeenCalled();
    });
  });

  describe('rule management', () => {
    const owner = { ...user, email: 'owner@firm.test', firmRole: FirmRole.OWNER };
    const manager = { ...user, email: 'om@firm.test', firmRole: FirmRole.OFFICE_MANAGER };
    const lawyer = { ...user, email: 'lawyer@firm.test', firmRole: FirmRole.LAWYER };
    const admin = { ...user, email: 'ops@platform.test', firmRole: FirmRole.OWNER };
    const dto = { trigger: DeadlineTrigger.COURT_DATE, label: ' ยื่นบัญชีระบุพยาน ', offsetDays: -10, dayBasis: DeadlineDayBasis.CALENDAR };

    beforeEach(() => {
      process.env.PLATFORM_ADMIN_EMAILS = 'ops@platform.test';
      mockPrisma.deadlineRule.findFirst.mockResolvedValue(null);
      mockPrisma.deadlineRule.create.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }));
    });

    it('an office manager creates a firm rule (the override of a global rule with the same label)', async () => {
      await service.create(manager, dto);
      expect(mockPrisma.deadlineRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmId: 'firm-1', label: 'ยื่นบัญชีระบุพยาน', offsetDays: -10, adjustDays: 0, caseTypeId: null }),
      });
    });

    it('a lawyer cannot create firm rules', async () => {
      await expect(service.create(lawyer, dto)).rejects.toThrow('ไม่มีสิทธิ์แก้กฎวันครบกำหนดของสำนักงาน');
    });

    it('only a platform admin creates a global rule', async () => {
      await expect(service.create(owner, { ...dto, global: true })).rejects.toThrow('ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ');
      await service.create(admin, { ...dto, global: true });
      expect(mockPrisma.deadlineRule.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: null }) });
    });

    it('rejects a duplicate trigger + label in the same scope', async () => {
      mockPrisma.deadlineRule.findFirst.mockResolvedValue({ id: 'dup' });
      await expect(service.create(owner, dto)).rejects.toThrow('มีกฎชื่อนี้สำหรับเหตุนี้อยู่แล้ว');
    });

    it('an owner edits their firm rule but not a global one', async () => {
      mockPrisma.deadlineRule.findFirst.mockResolvedValueOnce({ id: 'f', firmId: 'firm-1' });
      await service.update(owner, 'f', { offsetDays: 15 });
      expect(mockPrisma.deadlineRule.update).toHaveBeenCalledWith({ where: { id: 'f' }, data: { offsetDays: 15 } });

      mockPrisma.deadlineRule.findFirst.mockResolvedValueOnce({ id: 'g', firmId: null });
      await expect(service.update(owner, 'g', { offsetDays: 15 })).rejects.toThrow('ข้อมูลส่วนกลางแก้ได้เฉพาะผู้ดูแลระบบ');
    });

    it('never reaches another firm’s rule', async () => {
      mockPrisma.deadlineRule.findFirst.mockResolvedValue(null);
      await expect(service.update(owner, 'x', { offsetDays: 1 })).rejects.toThrow('Deadline rule not found');
      await expect(service.remove(owner, 'x')).rejects.toThrow('Deadline rule not found');
      expect(mockPrisma.deadlineRule.findFirst).toHaveBeenCalledWith({
        where: { id: 'x', OR: [{ firmId: null }, { firmId: 'firm-1' }] },
        select: { id: true, firmId: true },
      });
    });
  });
});

describe('CreateDeadlineRuleDto', () => {
  it('accepts a negative offset (N days before the trigger)', async () => {
    const dto = plainToInstance(CreateDeadlineRuleDto, {
      trigger: 'COURT_DATE', label: 'ยื่นบัญชีระบุพยาน', offsetDays: -7, dayBasis: 'CALENDAR',
    });
    expect(await validate(dto)).toEqual([]);
  });
});
