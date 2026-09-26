import { Test, TestingModule } from '@nestjs/testing';
import { AuthUser } from '@lawfirm/shared';
import { CourtDayService } from './court-day.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';

/**
 * Recording "next hearing" on a court day creates a follow-up calendar event.
 * That event has to carry every current assignee forward, not just the
 * primary — otherwise a co-counsel silently drops off the next hearing.
 */
describe('CourtDayService next-hearing assignee copy', () => {
  let service: CourtDayService;

  const currentEvent = {
    id: 'event-1',
    caseId: 'case-1',
    title: 'นัดไต่สวน',
    startAt: new Date('2020-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    courtName: 'ศาลแพ่ง',
    assigneeId: 'user-1',
    assignees: [{ userId: 'user-1' }, { userId: 'user-2' }],
    case: {
      id: 'case-1',
      firmId: 'firm-1',
      ownRef: 'C-1',
      title: 'Case',
      clientId: 'client-1',
      clientName: null,
      client: null,
      customers: [],
      courtName: 'ศาลแพ่ง',
      caseTypeId: 'type-1',
      leadLawyerId: 'user-1',
      leadLawyer: { firstName: 'A', lastName: 'B' },
    },
  };

  const validState = {
    checklist: [],
    taskIds: [],
    documents: [],
    notes: '',
    outcome: 'ศาลนัดไต่สวนต่อ',
    nextHearing: true,
    nextTitle: 'นัดไต่สวนครั้งถัดไป',
    nextAt: '2026-02-01T03:00:00.000Z',
    followUp: false,
    taskTitle: '',
    taskDue: '',
    expense: false,
    amount: '0',
    clientDraft: false,
    draftRecipientKind: 'CLIENT' as const,
    draftCustomerId: '',
  };

  const mockPrisma = {
    calendarEvent: { findFirst: jest.fn(), create: jest.fn() },
    courtDay: { findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    caseActivity: { create: jest.fn() },
    case: { update: jest.fn() },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const mockCaseAccess = { getCaseFilterForUser: jest.fn().mockReturnValue({}) };
  const mockDeadlines = { applyTrigger: jest.fn() };

  const user = { id: 'user-1', firmId: 'firm-1' } as AuthUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(currentEvent);
    mockPrisma.courtDay.findUnique.mockResolvedValue({
      eventId: 'event-1',
      version: 0,
      completedAt: null,
      state: validState,
    });
    mockPrisma.courtDay.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.caseActivity.create.mockResolvedValue({ id: 'activity-1' });
    mockPrisma.calendarEvent.create.mockResolvedValue({ id: 'event-2' });
    mockPrisma.courtDay.update.mockResolvedValue({ eventId: 'event-1', result: {} });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourtDayService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: DeadlineRulesService, useValue: mockDeadlines },
      ],
    }).compile();
    service = module.get(CourtDayService);
  });

  it('carries every current assignee onto the next-hearing event, with the same primary', async () => {
    await service.complete(user, 'event-1', {
      version: 0,
      eventUpdatedAt: currentEvent.updatedAt.toISOString(),
    });

    expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeId: 'user-1',
          assignees: { create: [{ userId: 'user-1' }, { userId: 'user-2' }] },
        }),
      }),
    );
  });
});
