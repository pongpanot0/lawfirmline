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
      caseStatusLog: { findFirst: jest.fn().mockResolvedValue(null) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      client: { count: jest.fn().mockResolvedValue(0) },
      caseType: { count: jest.fn().mockResolvedValue(0) },
      clientContact: { count: jest.fn().mockResolvedValue(0) },
    };
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

  it('close requires an outcome other than IN_PROGRESS', async () => {
    const errors = async (body: object) =>
      (await validate(plainToInstance(CloseCaseDto, { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', ...body }))).length;
    expect(await errors({})).toBeGreaterThan(0);
    expect(await errors({ outcome: 'IN_PROGRESS' })).toBeGreaterThan(0);
    expect(await errors({ outcome: 'SETTLED' })).toBe(0);
  });
});
