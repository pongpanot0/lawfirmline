import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CloseCaseDto } from './dto/close-case.dto';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';

describe('case stages', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  let service: CasesService;
  let prisma: any;
  const feed = { log: jest.fn() };
  const base = { id: 'case-1', status: 'IN_PROGRESS', stage: 'HEARING', title: 'คดี', ownRef: 'C-1', leadLawyerId: 'lead-1' };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findUnique: jest.fn().mockResolvedValue(base),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...base, ...data })),
      },
      caseProceeding: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      caseStatusLog: { findFirst: jest.fn().mockResolvedValue(null) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      client: { count: jest.fn().mockResolvedValue(0) },
      caseType: { count: jest.fn().mockResolvedValue(0) },
      clientContact: { count: jest.fn().mockResolvedValue(0) },
    };
    prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
        {
          provide: CaseAccessService,
          useValue: {
            canAccessCase: jest.fn().mockResolvedValue(true),
            getCaseFilterForUser: jest.fn().mockReturnValue({}),
            getTaskFilterForUser: jest.fn().mockReturnValue({}),
          },
        },
        { provide: CaseActivitiesService, useValue: { create: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn() } },
        { provide: ConflictCheckService, useValue: { gateNewCase: jest.fn().mockResolvedValue({ result: 'CLEAR', terms: [], matches: [], overrideReason: null }), recordForCase: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  it('logs a forward stage move with from/to stage', async () => {
    await service.update(user, 'case-1', { stage: 'AWAITING_JUDGMENT' } as any);

    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'STAGE_CHANGE',
        stageTransition: { from: 'HEARING', to: 'AWAITING_JUDGMENT', note: null, status: 'IN_PROGRESS' },
      }),
    );
  });

  it('refuses a backward move without a note', async () => {
    await expect(service.update(user, 'case-1', { stage: 'FILING' } as any)).rejects.toThrow(
      'ย้ายขั้นตอนย้อนกลับต้องระบุเหตุผล',
    );
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('accepts a backward move with a note and keeps the note in the log, not on the case', async () => {
    await service.update(user, 'case-1', { stage: 'FILING', stageNote: 'ศาลให้แก้คำฟ้อง' } as any);

    expect(prisma.case.update.mock.calls[0][0].data.stageNote).toBeUndefined();
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ stageTransition: expect.objectContaining({ note: 'ศาลให้แก้คำฟ้อง' }) }),
    );
  });

  it.each(['CLOSED', 'ARCHIVED'])('PATCH cannot set status %s', async (status) => {
    await expect(service.update(user, 'case-1', { status } as any)).rejects.toThrow('ใช้ปุ่มปิดคดี');
  });

  it('closing records the stage it left', async () => {
    await service.close(user, 'case-1', { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', outcome: 'WON' } as any);

    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({
        statusTransition: { from: 'IN_PROGRESS', to: 'CLOSED' },
        stageTransition: { from: 'HEARING', to: 'CLOSING' },
      }),
    );
  });

  it('reopen restores the stage that was current before closing', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, status: 'CLOSED', stage: 'CLOSING' });
    prisma.caseStatusLog.findFirst.mockResolvedValue({ fromStage: 'APPEAL' });

    await service.reopen(user, 'case-1');

    expect(prisma.caseStatusLog.findFirst).toHaveBeenCalledWith({
      where: { caseId: 'case-1', toStage: 'CLOSING', fromStage: { not: 'CLOSING' } },
      orderBy: { createdAt: 'desc' },
      select: { fromStage: true },
    });
    expect(prisma.case.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_PROGRESS', stage: 'APPEAL' });
  });

  it('reopening a case closed before stage logs existed falls back to PRE_LITIGATION', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, status: 'ARCHIVED', stage: 'CLOSING' });
    prisma.caseStatusLog.findFirst.mockResolvedValue(null);

    await service.reopen(user, 'case-1');

    expect(prisma.case.update.mock.calls[0][0].data).toMatchObject({ stage: 'PRE_LITIGATION' });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ stageTransition: { from: 'CLOSING', to: 'PRE_LITIGATION' } }),
    );
  });

  it('reopening without a usable log row keeps the stage the case sits at, unless it is CLOSING', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, status: 'ARCHIVED', stage: 'APPEAL' });
    prisma.caseStatusLog.findFirst.mockResolvedValue(null);

    await service.reopen(user, 'case-1');

    expect(prisma.case.update.mock.calls[0][0].data).toMatchObject({ stage: 'APPEAL' });
  });

  it.each(['CLOSED', 'ARCHIVED'])('PATCH cannot change the status of a %s case (use reopen)', async (current) => {
    prisma.case.findUnique.mockResolvedValue({ ...base, status: current, stage: 'CLOSING' });
    await expect(service.update(user, 'case-1', { status: 'IN_PROGRESS' } as any)).rejects.toThrow(
      'ใช้ปุ่มเปิดคดีอีกครั้ง',
    );
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('moving between fact gathering and pre-litigation needs no note', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, stage: 'PRE_LITIGATION' });
    await service.update(user, 'case-1', { stage: 'FACT_GATHERING' } as any);
    expect(prisma.case.update).toHaveBeenCalled();
  });

  it('close requires an outcome other than IN_PROGRESS', async () => {
    const errors = async (body: object) =>
      (await validate(plainToInstance(CloseCaseDto, { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', ...body }))).length;
    expect(await errors({})).toBeGreaterThan(0);
    expect(await errors({ outcome: 'IN_PROGRESS' })).toBeGreaterThan(0);
    expect(await errors({ outcome: 'SETTLED' })).toBe(0);
  });

  it('entering APPEAL sets the court level and opens an appeal proceeding', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, stage: 'AWAITING_JUDGMENT', courtLevel: 'TRIAL' });

    await service.update(user, 'case-1', { stage: 'APPEAL' } as any);

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'APPEAL' } } }),
    );
    expect(prisma.case.update).toHaveBeenCalledWith({ where: { id: 'case-1' }, data: { courtLevel: 'APPEAL' } });
  });

  it('entering APPEAL together with a new lead lawyer still notifies the lead', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, stage: 'AWAITING_JUDGMENT', courtLevel: 'TRIAL' });
    prisma.firmMember = { count: jest.fn().mockResolvedValue(1) };
    prisma.auditLog = { create: jest.fn() };

    await service.update(user, 'case-1', { stage: 'APPEAL', leadLawyerId: 'lead-2' } as any);

    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('editing the black number on the overview writes it into the current proceeding', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง' });

    await service.update(user, 'case-1', { blackCaseNumber: 'พ.9/2569' } as any);

    expect(prisma.caseProceeding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { caseId_courtLevel: { caseId: 'case-1', courtLevel: 'TRIAL' } },
        update: { blackCaseNumber: 'พ.9/2569' },
      }),
    );
  });

  describe('court levels keep each level’s numbers', () => {
    // In-memory case row + proceedings so the tests see what ends up where.
    const useDb = (caseRow: Record<string, unknown>, rows: Record<string, unknown>[] = []) => {
      const legalCase = { ...base, ...caseRow };
      const proceedings = new Map<string, any>(rows.map((r) => [r.courtLevel as string, { ...r }]));
      prisma.case.findUnique.mockImplementation(() => Promise.resolve({ ...legalCase }));
      prisma.case.update.mockImplementation(({ data }: any) => {
        Object.assign(legalCase, data);
        return Promise.resolve({ ...legalCase });
      });
      prisma.caseProceeding.upsert.mockImplementation(({ where, create, update }: any) => {
        const level = where.caseId_courtLevel.courtLevel;
        const row = proceedings.has(level)
          ? Object.assign(proceedings.get(level), update)
          : { courtName: null, blackCaseNumber: null, redCaseNumber: null, ...create };
        proceedings.set(level, row);
        return Promise.resolve(row);
      });
      prisma.caseProceeding.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(proceedings.get(where.caseId_courtLevel.courtLevel) ?? null),
      );
      return { legalCase, proceedings };
    };
    const trialCase = { courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: null };
    const overview = (over: Record<string, unknown>) =>
      ({ courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: '', courtLevel: 'TRIAL', ...over }) as any;

    it('moving to APPEAL keeps the trial numbers on a TRIAL proceeding even when none existed', async () => {
      const db = useDb({ ...trialCase, stage: 'AWAITING_JUDGMENT' });

      await service.update(user, 'case-1', { stage: 'APPEAL' } as any);

      expect(db.proceedings.get('TRIAL')).toMatchObject({ courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569' });
      expect(db.legalCase).toMatchObject({
        courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: null, redCaseNumber: null,
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('an overview save switching TRIAL → APPEAL leaves the trial numbers on TRIAL', async () => {
      const db = useDb(trialCase);

      await service.update(user, 'case-1', overview({ courtLevel: 'APPEAL' }));

      expect(db.proceedings.get('TRIAL')).toMatchObject({ blackCaseNumber: 'พ.1/2569' });
      expect(db.proceedings.get('APPEAL')).toMatchObject({ courtName: 'ศาลอุทธรณ์', blackCaseNumber: null });
      expect(db.legalCase).toMatchObject({ courtLevel: 'APPEAL', blackCaseNumber: null });
    });

    it('numbers edited in the same save as a level switch belong to the level being edited', async () => {
      const db = useDb(trialCase);

      await service.update(user, 'case-1', overview({ courtLevel: 'APPEAL', redCaseNumber: 'พ.9/2570' }));

      expect(db.proceedings.get('TRIAL')).toMatchObject({ redCaseNumber: 'พ.9/2570' });
      expect(db.proceedings.get('APPEAL')).toMatchObject({ redCaseNumber: null });
    });

    it('switching APPEAL → TRIAL does not overwrite TRIAL with the appeal numbers', async () => {
      const db = useDb(
        { courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', redCaseNumber: null },
        [
          { courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: null },
          { courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', redCaseNumber: null },
        ],
      );

      await service.update(user, 'case-1', overview({ courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', courtLevel: 'TRIAL' }));

      expect(db.proceedings.get('TRIAL')).toMatchObject({ courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569' });
      expect(db.legalCase).toMatchObject({ courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569' });
    });

    it('an unchanged overview save creates no proceeding', async () => {
      useDb(trialCase);

      await service.update(user, 'case-1', overview({}));

      expect(prisma.caseProceeding.upsert).not.toHaveBeenCalled();
    });
  });

  it('every case response carries full participant rows', async () => {
    await service.update(user, 'case-1', { title: 'ชื่อใหม่' } as any);
    expect(prisma.case.update.mock.calls[0][0].include.participants).toEqual({ orderBy: { createdAt: 'asc' } });
  });

  it('an overview save that repeats the same client and side touches no participant', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, clientId: 'cl-1', partyRole: 'PLAINTIFF' });
    prisma.client.count.mockResolvedValue(1);
    prisma.caseParticipant = { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() };

    await service.update(user, 'case-1', { title: 'ชื่อใหม่', clientId: 'cl-1', partyRole: 'PLAINTIFF' } as any);

    expect(prisma.caseParticipant.findFirst).not.toHaveBeenCalled();
    expect(prisma.caseParticipant.create).not.toHaveBeenCalled();
    expect(prisma.caseParticipant.update).not.toHaveBeenCalled();
  });

  it('a changed side syncs our client with the previous values', async () => {
    prisma.case.findUnique.mockResolvedValue({ ...base, clientId: 'cl-1', partyRole: 'PLAINTIFF', client: { name: 'ก' } });
    prisma.client.count.mockResolvedValue(1);
    prisma.caseParticipant = {
      findFirst: jest.fn().mockResolvedValue({ id: 'p1', role: 'PLAINTIFF', side: 'OURS' }),
      create: jest.fn(),
      update: jest.fn(),
    };
    prisma.case.findUnique
      .mockResolvedValueOnce({ ...base, clientId: 'cl-1', partyRole: 'PLAINTIFF' }) // before
      .mockResolvedValueOnce({ partyRole: 'DEFENDANT', clientId: 'cl-1', clientName: null, client: { name: 'ก' } }); // sync

    await service.update(user, 'case-1', { partyRole: 'DEFENDANT' } as any);

    expect(prisma.caseParticipant.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { role: 'DEFENDANT', side: 'OURS' } });
  });
});
