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

describe('IntakeService assignment notifications', () => {
  let service: IntakeService;
  const mockPrisma = {
    intake: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
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
        {
          provide: CaseAccessService,
          useValue: { getIntakeFilterForUser: jest.fn().mockResolvedValue({ firmId: 'firm-1' }) },
        },
        { provide: TasksService, useValue: {} },
        { provide: IntakePrecedentAnalysisService, useValue: {} },
        { provide: DocumentsService, useValue: {} },
        { provide: FileStorageService, useValue: { put: jest.fn(), delete: jest.fn() } },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    service = module.get(IntakeService);
  });

  it('notifies assigned members on create', async () => {
    mockPrisma.intake.create.mockResolvedValue({ id: 'i1', title: 'เรื่องทดสอบ' });
    await service.create(user, {
      receivedDate: '2026-09-17',
      title: 'เรื่องทดสอบ',
      assignedUserIds: ['u2', 'u3'],
    } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u2', 'u3'],
      actorUserId: 'user-1',
      summaryText: expect.stringContaining('เรื่องทดสอบ'),
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
