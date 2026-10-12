import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntakeService } from './intake.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PrismaService } from '../prisma/prisma.module';
import { TasksService } from '../tasks/tasks.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { DocumentsService } from '../documents/documents.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { syncLimitationReminder } from '../common/limitation-reminder';

jest.mock('../common/limitation-reminder', () => ({ syncLimitationReminder: jest.fn() }));

/** The ครบอายุความ event replaces the legacy "ครบกำหนด:" event when both fall on the same Bangkok day. */
describe('IntakeService conversion — limitation event vs legacy deadline event', () => {
  const mockPrisma = {
    intake: { findFirst: jest.fn(), update: jest.fn() },
    task: { updateMany: jest.fn() },
    firm: { findUnique: jest.fn() },
    case: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    intakePrecedentAnalysis: { updateMany: jest.fn() },
    caseAssignment: { createMany: jest.fn() },
    calendarEvent: { create: jest.fn() },
    document: { updateMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    intakeAttachment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;
  const sync = syncLimitationReminder as jest.Mock;
  // 2026-10-01 10:00 Bangkok
  const intakeDeadline = new Date('2026-10-01T03:00:00.000Z');
  let service: IntakeService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.intakeAttachment.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
        { provide: ConflictCheckService, useValue: { latestForIntake: jest.fn().mockResolvedValue({ result: 'CLEAR' }) } },
        { provide: CaseAccessService, useValue: { getIntakeFilterForUser: jest.fn().mockResolvedValue({ firmId: 'firm-1' }) } },
        { provide: TasksService, useValue: { create: jest.fn() } },
        { provide: IntakePrecedentAnalysisService, useValue: {} },
        { provide: DocumentsService, useValue: { adoptIntakeAttachments: jest.fn() } },
        { provide: FileStorageService, useValue: {} },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  const arrangeNewCase = () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'intake-1', firmId: 'firm-1', title: 'คดี', clientName: 'A', matterType: 'x', description: null,
      referralName: null, deadlineDate: intakeDeadline, assignedUserIds: [],
    });
    mockPrisma.firm.findUnique.mockResolvedValue({ ownRefPrefix: 'REF' });
    mockPrisma.case.findMany.mockResolvedValue([]);
    mockPrisma.case.create.mockResolvedValue({
      id: 'case-1', title: 'คดี', leadLawyerId: 'user-1', limitationDeadline: intakeDeadline,
    });
    mockPrisma.intake.update.mockResolvedValue({});
    mockPrisma.intakePrecedentAnalysis.updateMany.mockResolvedValue({ count: 0 });
  };

  const arrangeAttach = (caseDeadline: Date | null) => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'intake-1', firmId: 'firm-1', relatedCaseId: 'case-1', assignedUserIds: [], deadlineDate: intakeDeadline,
    });
    mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', firmId: 'firm-1', title: 'คดีเดิม', limitationDeadline: caseDeadline });
    mockPrisma.case.update.mockResolvedValue({ id: 'case-1', title: 'คดีเดิม', limitationDeadline: caseDeadline ?? intakeDeadline });
  };

  it('new case: skips the legacy event when the limitation event covers the same day', async () => {
    arrangeNewCase();
    sync.mockResolvedValue('evt-lim');

    await service.convertToCase(user, 'intake-1', {} as any);

    expect(sync).toHaveBeenCalledWith(mockPrisma, 'case-1');
    expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('new case: keeps the legacy event when no limitation event was made', async () => {
    arrangeNewCase();
    sync.mockResolvedValue(null);

    await service.convertToCase(user, 'intake-1', {} as any);

    expect(mockPrisma.calendarEvent.create).toHaveBeenCalledTimes(1);
  });

  it('attach: skips the legacy event when the case deadline is the same Bangkok day', async () => {
    arrangeAttach(new Date('2026-09-30T20:00:00.000Z')); // 2026-10-01 03:00 Bangkok
    sync.mockResolvedValue('evt-lim');

    await service.convertToCase(user, 'intake-1', {});

    expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('attach: keeps the legacy event when the case keeps a different limitation day', async () => {
    arrangeAttach(new Date('2027-03-01T00:00:00.000Z'));
    sync.mockResolvedValue('evt-lim');

    await service.convertToCase(user, 'intake-1', {});

    expect(mockPrisma.calendarEvent.create).toHaveBeenCalledTimes(1);
  });
});
