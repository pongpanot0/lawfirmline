import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IntakeService } from './intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { TasksService } from '../tasks/tasks.service';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { DocumentsService } from '../documents/documents.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';

describe('IntakeService assignment notifications', () => {
  let service: IntakeService;
  const mockPrisma = {
    intake: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    case: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'case-new', title: 'x', leadLawyerId: 'user-1' }), update: jest.fn().mockResolvedValue({ id: 'case-1', title: 'x', leadLawyerId: 'user-1' }) },
    firm: { findUnique: jest.fn().mockResolvedValue({ ownRefPrefix: 'REF' }) },
    caseAssignment: { createMany: jest.fn() },
    calendarEvent: { create: jest.fn() },
    intakePrecedentAnalysis: { updateMany: jest.fn() },
    insuranceClaim: { create: jest.fn() },
    document: { updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    intakeAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    task: { updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    appliedPlaybook: { create: jest.fn() },

    firmMember: { findMany: jest.fn() },
    intakeFieldProposal: { updateMany: jest.fn() },
  };
  const mockNotifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: 'OWNER' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.firmMember.findMany.mockResolvedValue([
      { userId: 'u2', role: 'LAWYER' },
      { userId: 'u3', role: 'LAWYER' },
      { userId: 'u4', role: 'LAWYER' },
    ]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntakeService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
        { provide: ConflictCheckService, useValue: { latestForIntake: jest.fn().mockResolvedValue({ result: 'CLEAR' }) } },
        {
          provide: CaseAccessService,
          useValue: { getIntakeFilterForUser: jest.fn().mockResolvedValue({ firmId: 'firm-1' }) },
        },
        { provide: TasksService, useValue: { create: jest.fn() } },
        { provide: IntakePrecedentAnalysisService, useValue: {} },
        { provide: DocumentsService, useValue: { adoptIntakeAttachments: jest.fn() } },
        { provide: FileStorageService, useValue: { put: jest.fn(), delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  it('notifies assigned members on create', async () => {
    mockPrisma.intake.create.mockResolvedValue({ id: 'i1', title: 'เรื่องทดสอบ', firmId: 'firm-1', relatedCaseId: null, assignedUserIds: ['u2', 'u3'], deadlineDate: null, customers: [], clientId: null, matterType: null });
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'i1', firmId: 'firm-1', title: 'เรื่องทดสอบ', case: { ownRef: 'TSBREF20260002' },
    });
    await service.create(user, {
      receivedDate: '2026-09-17',
      title: 'เรื่องทดสอบ',
      assignedUserIds: ['u2', 'u3'],
    } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['u2', 'u3'],
      actorUserId: 'user-1',
      summaryText: '📥 คุณได้รับมอบหมายเรื่องรับใหม่\nเรื่อง: เรื่องทดสอบ\nOur Ref: TSBREF20260002',
      entityPath: '/intake/i1',
    });
  });

  it('notifies only newly added members on update', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'i1',
      title: 'เรื่องเดิม',
      assignedUserIds: ['u2'],
    });
    mockPrisma.intake.update.mockResolvedValue({ id: 'i1', title: 'เรื่องเดิม' });
    await service.update(user, 'i1', { assignedUserIds: ['u2', 'u4'] } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['u4'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('เรื่องเดิม'),
      entityPath: '/intake/i1',
    });
  });

  it('does not notify when the list is unchanged', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({
      id: 'i1',
      title: 'เรื่องเดิม',
      assignedUserIds: ['u2'],
    });
    mockPrisma.intake.update.mockResolvedValue({ id: 'i1', title: 'เรื่องเดิม' });
    await service.update(user, 'i1', { assignedUserIds: ['u2'] } as any);
    expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
  });
});
