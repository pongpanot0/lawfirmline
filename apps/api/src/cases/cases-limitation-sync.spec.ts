import { Test } from '@nestjs/testing';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

/** close / archive / reopen / delete keep the ครบอายุความ event in step with the case (real sync, mocked prisma). */
describe('CasesService — limitation reminder follows case state', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  const deadline = new Date('2027-03-01T00:00:00.000Z');
  let service: CasesService;
  let prisma: any;
  /** What the DB row looks like after the state change under test. */
  let afterChange: Record<string, unknown>;

  beforeEach(async () => {
    afterChange = {};
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findUnique: jest.fn().mockImplementation(async () => ({
          limitationDeadline: deadline,
          limitationEventId: 'evt-1',
          leadLawyerId: 'lead-1',
          blackCaseNumber: null,
          status: 'OPEN',
          deletedAt: null,
          ...afterChange,
        })),
        update: jest.fn().mockResolvedValue({ id: 'case-1' }),
      },
      caseProceeding: { count: jest.fn().mockResolvedValue(0) },
      calendarEvent: {
        findUnique: jest.fn().mockResolvedValue({ id: 'evt-1', startAt: new Date('2027-03-01T09:30:00.000Z') }),
        create: jest.fn().mockResolvedValue({ id: 'evt-new' }),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      reminderLog: { deleteMany: jest.fn() },
      caseStatusLog: { findFirst: jest.fn().mockResolvedValue(null) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
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
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'case-1', status: 'OPEN', stage: 'HEARING', title: 'คดี' } as never);
  });

  it('close removes the event', async () => {
    afterChange = { status: 'CLOSED' };
    await service.close(user, 'case-1', { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', outcome: 'WON' } as any);
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
  });

  it('archive removes the event', async () => {
    (service.findOne as jest.Mock).mockResolvedValue({ id: 'case-1', status: 'CLOSED' });
    afterChange = { status: 'ARCHIVED' };
    await service.archive(user, 'case-1');
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
  });

  it('reopen recreates the event for a future deadline with no filing', async () => {
    (service.findOne as jest.Mock).mockResolvedValue({ id: 'case-1', status: 'CLOSED', stage: 'CLOSING' });
    afterChange = { status: 'IN_PROGRESS', limitationEventId: null };
    await service.reopen(user, 'case-1');
    expect(prisma.calendarEvent.create).toHaveBeenCalled();
    expect(prisma.case.update).toHaveBeenLastCalledWith({ where: { id: 'case-1' }, data: { limitationEventId: 'evt-new' } });
  });

  it('soft delete removes the event', async () => {
    afterChange = { deletedAt: new Date() };
    await service.remove(user, 'case-1');
    expect(prisma.calendarEvent.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
  });

  it('a failing sync never breaks the close', async () => {
    prisma.case.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      service.close(user, 'case-1', { closingSummary: 'สรุปคดีอย่างน้อยสิบตัวอักษร', outcome: 'WON' } as any),
    ).resolves.toBeDefined();
  });
});
