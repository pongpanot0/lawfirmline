import { Test } from '@nestjs/testing';
import { CaseProceedingsService } from './case-proceedings.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseFeedService } from '../common/services/case-feed.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('CaseProceedingsService', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'LAWYER' } as any;
  let service: CaseProceedingsService;
  let prisma: any;
  let inTx: boolean;
  const calledInTx: Record<string, boolean[]> = {};
  const track = (name: string, value?: unknown) =>
    jest.fn().mockImplementation(() => {
      (calledInTx[name] ??= []).push(inTx);
      return Promise.resolve(value);
    });
  const feed = { log: jest.fn() };
  let deadlines: { applyTrigger: jest.Mock };
  let notifier: { notifyAssigned: jest.Mock };
  const legalCase = {
    id: 'case-1', firmId: 'firm-1', caseTypeId: null, status: 'IN_PROGRESS', stage: 'PRE_LITIGATION',
    courtLevel: null, courtName: 'ศาลแพ่ง', blackCaseNumber: null, redCaseNumber: null,
    ownRef: 'C-1', leadLawyerId: 'lead-1',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key of Object.keys(calledInTx)) delete calledInTx[key];
    inTx = false;
    deadlines = { applyTrigger: track('applyTrigger', 2) };
    notifier = { notifyAssigned: track('notifyAssigned') };
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(legalCase),
        findUnique: jest.fn().mockResolvedValue({ ...legalCase, limitationDeadline: null, limitationEventId: null }),
        update: jest.fn().mockResolvedValue({}),
      },
      caseProceeding: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create, update }) => Promise.resolve({ id: 'p1', ...create, ...update })),
        count: jest.fn().mockResolvedValue(1),
      },
      calendarEvent: { findUnique: jest.fn(), delete: jest.fn() },
      reminderLog: { deleteMany: jest.fn() },
      documentDateSuggestion: {
        findFirst: jest.fn().mockResolvedValue({ suggestedDate: new Date('2026-11-12T09:30:00.000Z') }),
      },
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => {
        inTx = true;
        try {
          return await fn(prisma);
        } finally {
          inTx = false;
        }
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        CaseProceedingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
        { provide: DeadlineRulesService, useValue: deadlines },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    service = module.get(CaseProceedingsService);
  });

  it('filing saves the black number, fires FILED and moves the stage to FILING', async () => {
    const result = await service.recordFiling(user, 'case-1', {
      filedAt: '2026-10-12T03:00:00.000Z', blackCaseNumber: ' พ.123/2569 ',
    });

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } },
        update: { filedAt: new Date('2026-10-12T03:00:00.000Z'), blackCaseNumber: 'พ.123/2569' },
      }),
    );
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', trigger: 'FILED', triggerEventId: null, createdById: 'u1' }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { stage: 'FILING', stageChangedAt: expect.any(Date) },
    });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ stageTransition: { from: 'PRE_LITIGATION', to: 'FILING', status: 'IN_PROGRESS' } }),
      prisma,
    );
    expect(feed.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'FILING' }), prisma);
    expect(result.suggestions).toBe(2);
  });

  it('filing at the current level keeps a black number that lives only on the case', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, blackCaseNumber: 'พ.1/2569' });
    await service.recordFiling(user, 'case-1', { filedAt: '2026-10-12T03:00:00.000Z' });
    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ courtLevel: 'TRIAL', blackCaseNumber: 'พ.1/2569' }) }),
    );
  });

  it('filing removes the limitation reminder, and a sync failure does not fail the filing', async () => {
    await service.recordFiling(user, 'case-1', { filedAt: '2026-10-12T03:00:00.000Z' });
    expect(prisma.caseProceeding.count).toHaveBeenCalled();

    prisma.caseProceeding.count.mockRejectedValue(new Error('db down'));
    await expect(service.recordFiling(user, 'case-1', { filedAt: '2026-10-12T03:00:00.000Z' })).resolves.toBeDefined();
  });

  it('filing does not move a case that is already past FILING', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, stage: 'HEARING' });
    await service.recordFiling(user, 'case-1', { filedAt: '2026-10-12T03:00:00.000Z' });
    expect(prisma.case.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'FILING' }) }));
  });

  it('service passes the method to the engine', async () => {
    await service.recordService(user, 'case-1', { servedAt: '2026-10-20T03:00:00.000Z', method: 'POSTED' as any });
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'COMPLAINT_SERVED', serviceMethod: 'POSTED', triggerDate: new Date('2026-10-20T03:00:00.000Z') }),
    );
  });

  it('judgment saves the result, fires JUDGMENT at the level and tells the lead the appeal deadline', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, stage: 'HEARING' });

    await service.recordJudgment(user, 'case-1', {
      courtLevel: 'TRIAL' as any, judgmentAt: '2026-10-12T03:00:00.000Z', outcome: 'WON' as any,
      amount: 500000, redCaseNumber: 'พ.9/2569', note: 'ให้ชำระพร้อมดอกเบี้ย',
    });

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          judgmentAt: new Date('2026-10-12T03:00:00.000Z'), judgmentOutcome: 'WON', judgmentAmount: 500000,
          redCaseNumber: 'พ.9/2569', judgmentNote: 'ให้ชำระพร้อมดอกเบี้ย',
        }),
      }),
    );
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'JUDGMENT', courtLevel: 'TRIAL' }));
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { stage: 'AWAITING_JUDGMENT', stageChangedAt: expect.any(Date) },
    });
    expect(prisma.documentDateSuggestion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deadlineRule: { trigger: 'JUDGMENT', courtLevel: 'TRIAL' } }),
      }),
    );
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['lead-1'],
        summaryText: expect.stringContaining('บันทึกคำพิพากษาแล้ว — ครบกำหนดอุทธรณ์ พฤ. 12 พ.ย. 2569'),
      }),
    );
  });

  it('the engine and the lead notice run after the transaction commits', async () => {
    await service.recordJudgment(user, 'case-1', {
      courtLevel: 'TRIAL' as any, judgmentAt: '2026-10-12T03:00:00.000Z', outcome: 'WON' as any,
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(calledInTx.applyTrigger).toEqual([false]);
    expect(calledInTx.notifyAssigned).toEqual([false]);
  });

  it('a judgment re-sent with the same date (double submit) fires, logs and notifies nothing', async () => {
    prisma.caseProceeding.findUnique.mockResolvedValue({
      id: 'p1', courtLevel: 'TRIAL', judgmentAt: new Date('2026-10-12T03:00:00.000Z'), judgmentOutcome: 'WON',
    });

    const result = await service.recordJudgment(user, 'case-1', {
      courtLevel: 'TRIAL' as any, judgmentAt: '2026-10-12T03:00:00.000Z', outcome: 'WON' as any,
    });

    expect(result).toEqual({ proceeding: expect.objectContaining({ id: 'p1' }), suggestions: 0 });
    // Only the same (caseId, TRIAL) row is touched — the unique key rules out a second proceeding.
    for (const [args] of prisma.caseProceeding.upsert.mock.calls) {
      expect(args.where).toEqual({ caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } });
    }
    expect(deadlines.applyTrigger).not.toHaveBeenCalled();
    expect(feed.log).not.toHaveBeenCalled();
    expect(prisma.case.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: expect.anything() }) }));
    expect(notifier.notifyAssigned).not.toHaveBeenCalled();
  });

  it('a same-date re-send with a corrected outcome saves the correction', async () => {
    prisma.caseProceeding.findUnique.mockResolvedValue({
      id: 'p1', courtLevel: 'TRIAL', judgmentAt: new Date('2026-10-12T03:00:00.000Z'), judgmentOutcome: 'WON',
    });
    await service.recordJudgment(user, 'case-1', {
      courtLevel: 'TRIAL' as any, judgmentAt: '2026-10-12T03:00:00.000Z', outcome: 'LOST' as any,
    });
    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ judgmentOutcome: 'LOST' }) }),
    );
    expect(deadlines.applyTrigger).not.toHaveBeenCalled();
  });

  it('an appeal-level judgment keeps an APPEAL stage and names ฎีกา in the notice', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, stage: 'APPEAL', courtLevel: 'APPEAL' });

    await service.recordJudgment(user, 'case-1', {
      courtLevel: 'APPEAL' as any, judgmentAt: '2027-03-01T03:00:00.000Z', outcome: 'LOST' as any,
    });

    expect(prisma.case.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stage: 'AWAITING_JUDGMENT' }) }));
    expect(notifier.notifyAssigned).toHaveBeenCalledWith(
      expect.objectContaining({ summaryText: expect.stringContaining('ครบกำหนดฎีกา') }),
    );
  });

  it('appeal copy received fires APPEAL_SERVED', async () => {
    await service.recordAppealServed(user, 'case-1', { servedAt: '2026-12-01T03:00:00.000Z' });
    expect(deadlines.applyTrigger).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'APPEAL_SERVED' }));
  });

  it('editing the current level keeps the case numbers it does not touch', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, blackCaseNumber: 'พ.1/2569' });
    await service.update(user, 'case-1', 'TRIAL' as any, { redCaseNumber: 'พ.9/2569' });
    // snapshot first, so the mirror never blanks the black number
    expect(prisma.caseProceeding.upsert.mock.calls[0][0].create).toEqual(
      expect.objectContaining({ courtLevel: 'TRIAL', blackCaseNumber: 'พ.1/2569' }),
    );
  });

  it('refuses actions on a closed case', async () => {
    prisma.case.findFirst.mockResolvedValue({ ...legalCase, status: 'CLOSED' });
    await expect(service.recordAppealServed(user, 'case-1', { servedAt: '2026-12-01T03:00:00.000Z' })).rejects.toThrow('คดีปิดแล้ว');
  });
});
