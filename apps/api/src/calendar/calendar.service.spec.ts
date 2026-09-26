import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, EventType } from '@lawfirm/shared';
import { CalendarService } from './calendar.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { LineLinkService } from '../notifications/line-link.service';
import { TravelService } from '../travel/travel.service';
import { DeadlineRulesService } from '../deadlines/deadline-rules.service';

/**
 * An event is addressable by id, so every single-event path has to re-apply the
 * case filter the list query uses. Without it an id guessed or leaked from
 * another firm reads, edits and deletes straight through.
 */
describe('CalendarService case authorization', () => {
  let service: CalendarService;

  const mockPrisma = {
    calendarEvent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    calendarEventAssignee: { deleteMany: jest.fn() },
    firmMember: { findMany: jest.fn() },
    case: { findUnique: jest.fn(), update: jest.fn() },
    travelLog: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const mockCaseAccess = { canAccessCase: jest.fn(), getCaseFilterForUser: jest.fn() };
  const mockLineMessaging = { sendCourtDateAlert: jest.fn() };
  const mockLineLink = { getLineUserIdsForCase: jest.fn().mockResolvedValue([]) };
  const mockTravel = { getOfficeAddress: jest.fn(), calculateTravel: jest.fn() };
  const mockDeadlineRules = { applyTrigger: jest.fn() };

  const user = { id: 'user-1', firmId: 'firm-1' } as AuthUser;
  const otherFirmEvent = { id: 'event-1', caseId: 'case-other', title: 'Hearing' };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: LineMessagingService, useValue: mockLineMessaging },
        { provide: LineLinkService, useValue: mockLineLink },
        { provide: TravelService, useValue: mockTravel },
        { provide: DeadlineRulesService, useValue: mockDeadlineRules },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  it('refuses to read an event on a case the user cannot reach', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue(otherFirmEvent);
    mockCaseAccess.canAccessCase.mockResolvedValue(false);

    await expect(service.findOne(user, 'event-1')).rejects.toThrow(ForbiddenException);
    expect(mockCaseAccess.canAccessCase).toHaveBeenCalledWith(user, 'case-other');
  });

  it('refuses to edit an event on a case the user cannot reach', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue(otherFirmEvent);
    mockCaseAccess.canAccessCase.mockResolvedValue(false);

    await expect(
      service.update(user, 'event-1', { title: 'moved' }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('refuses to delete an event on a case the user cannot reach', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue(otherFirmEvent);
    mockCaseAccess.canAccessCase.mockResolvedValue(false);

    await expect(service.remove(user, 'event-1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.calendarEvent.delete).not.toHaveBeenCalled();
  });

  it('refuses to add an event to a case the user cannot reach', async () => {
    mockCaseAccess.canAccessCase.mockResolvedValue(false);

    await expect(
      service.create(user, {
        caseId: 'case-other',
        title: 'Hearing',
        startAt: '2026-09-07T02:00:00.000Z',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('still reports a missing event as missing rather than forbidden', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue(null);

    await expect(service.findOne(user, 'nope')).rejects.toThrow(NotFoundException);
  });

  it('lets a reachable case through and attributes the event to the actor', async () => {
    mockCaseAccess.canAccessCase.mockResolvedValue(true);
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      firmId: 'firm-1',
      caseTypeId: 'type-1',
      ownRef: 'C-1',
      title: 'Case',
      courtName: null,
      leadLawyer: { firstName: 'A', lastName: 'B' },
    });
    mockPrisma.calendarEvent.create.mockResolvedValue({ id: 'event-9', startAt: new Date() });

    await service.create(user, {
      caseId: 'case-1',
      title: 'Client meeting',
      startAt: '2026-09-07T02:00:00.000Z',
      type: EventType.CLIENT_MEETING,
    });

    expect(mockPrisma.calendarEvent.create).toHaveBeenCalled();
  });

  it('keeps the internal path open for services that already authorized the case', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      firmId: 'firm-1',
      caseTypeId: 'type-1',
      ownRef: 'C-1',
      title: 'Case',
      courtName: null,
      leadLawyer: { firstName: 'A', lastName: 'B' },
    });
    mockPrisma.calendarEvent.create.mockResolvedValue({ id: 'event-9', startAt: new Date() });

    await service.createInternal({
      caseId: 'case-1',
      title: 'อายุความ',
      startAt: '2026-09-07T02:00:00.000Z',
      type: EventType.DEADLINE,
    });

    expect(mockCaseAccess.canAccessCase).not.toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.create).toHaveBeenCalled();
  });
});

/**
 * assigneeIds lets an event have several responsible people; assigneeId stays
 * as the primary (first id) for callers that only read the single field.
 */
describe('CalendarService multiple assignees', () => {
  let service: CalendarService;

  const mockPrisma = {
    calendarEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    calendarEventAssignee: { deleteMany: jest.fn() },
    firmMember: { findMany: jest.fn() },
    case: { findUnique: jest.fn(), update: jest.fn() },
    travelLog: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const mockCaseAccess = { canAccessCase: jest.fn(), getCaseFilterForUser: jest.fn() };
  const mockLineMessaging = { sendCourtDateAlert: jest.fn() };
  const mockLineLink = { getLineUserIdsForCase: jest.fn().mockResolvedValue([]) };
  const mockTravel = { getOfficeAddress: jest.fn(), calculateTravel: jest.fn() };
  const mockDeadlineRules = { applyTrigger: jest.fn() };

  const legalCase = {
    id: 'case-1',
    firmId: 'firm-1',
    caseTypeId: 'type-1',
    ownRef: 'C-1',
    title: 'Case',
    courtName: null,
    leadLawyer: { firstName: 'A', lastName: 'B' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    mockPrisma.case.findUnique.mockResolvedValue(legalCase);
    mockPrisma.firmMember.findMany.mockImplementation(async ({ where }: any) =>
      where.userId.in.map((userId: string) => ({ userId })),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: LineMessagingService, useValue: mockLineMessaging },
        { provide: LineLinkService, useValue: mockLineLink },
        { provide: TravelService, useValue: mockTravel },
        { provide: DeadlineRulesService, useValue: mockDeadlineRules },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  it('create with 2 ids creates 2 rows and sets assigneeId to the first', async () => {
    mockPrisma.calendarEvent.create.mockResolvedValue({ id: 'event-1', startAt: new Date() });

    await service.createInternal({
      caseId: 'case-1',
      title: 'Hearing',
      startAt: '2026-09-07T02:00:00.000Z',
      assigneeIds: ['user-1', 'user-2'],
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

  it('legacy assigneeId becomes 1 row', async () => {
    mockPrisma.calendarEvent.create.mockResolvedValue({ id: 'event-1', startAt: new Date() });

    await service.createInternal({
      caseId: 'case-1',
      title: 'Hearing',
      startAt: '2026-09-07T02:00:00.000Z',
      assigneeId: 'user-1',
    });

    expect(mockPrisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assigneeId: 'user-1',
          assignees: { create: [{ userId: 'user-1' }] },
        }),
      }),
    );
  });

  it('a non-member id throws BadRequest', async () => {
    mockPrisma.firmMember.findMany.mockResolvedValue([]);

    await expect(
      service.createInternal({
        caseId: 'case-1',
        title: 'Hearing',
        startAt: '2026-09-07T02:00:00.000Z',
        assigneeIds: ['outsider-1'],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('update with [] clears the rows and sets assigneeId to null', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      caseId: 'case-1',
      startAt: new Date('2026-09-07T02:00:00.000Z'),
      case: { firmId: 'firm-1' },
    });
    mockPrisma.calendarEvent.update.mockResolvedValue({ id: 'event-1' });

    await service.updateInternal('event-1', { assigneeIds: [] });

    expect(mockPrisma.calendarEventAssignee.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: null, assignees: { create: [] } }),
      }),
    );
  });

  it('explicit assigneeId: null clears the rows, same as assigneeIds: []', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      caseId: 'case-1',
      startAt: new Date('2026-09-07T02:00:00.000Z'),
      case: { firmId: 'firm-1' },
    });
    mockPrisma.calendarEvent.update.mockResolvedValue({ id: 'event-1' });

    await service.updateInternal('event-1', { assigneeId: null } as any);

    expect(mockPrisma.calendarEventAssignee.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1' },
    });
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: null, assignees: { create: [] } }),
      }),
    );
  });

  it('update without the field leaves assignees untouched', async () => {
    mockPrisma.calendarEvent.findUnique.mockResolvedValue({
      id: 'event-1',
      caseId: 'case-1',
      startAt: new Date('2026-09-07T02:00:00.000Z'),
      case: { firmId: 'firm-1' },
    });
    mockPrisma.calendarEvent.update.mockResolvedValue({ id: 'event-1' });

    await service.updateInternal('event-1', { title: 'Renamed' });

    expect(mockPrisma.calendarEventAssignee.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.calendarEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ assignees: expect.anything() }),
      }),
    );
  });
});
