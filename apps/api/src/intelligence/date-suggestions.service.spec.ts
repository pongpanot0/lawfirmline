import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { DateSuggestionStatus, EventType } from '@lawfirm/shared';
import { DateSuggestionsService } from './date-suggestions.service';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';

describe('DateSuggestionsService', () => {
  let service: DateSuggestionsService;
  const mockPrisma = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    documentDateSuggestion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    case: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
  };
  const mockCalendar = { createInternal: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async callback => callback(mockPrisma));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DateSuggestionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CalendarService, useValue: mockCalendar },
      ],
    }).compile();
    service = module.get(DateSuggestionsService);
  });

  describe('listForCase', () => {
    it('defaults to PENDING status', async () => {
      mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
      await service.listForCase('case-1');
      expect(mockPrisma.documentDateSuggestion.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1', status: DateSuggestionStatus.PENDING },
        include: { deadlineRule: { select: { label: true, trigger: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('confirm', () => {
    const pending = {
      id: 'sug-1',
      caseId: 'case-1',
      label: 'วันนัดไต่สวน',
      suggestedDate: new Date('2026-10-01T00:00:00.000Z'),
      eventType: EventType.COURT_DATE,
      status: DateSuggestionStatus.PENDING,
      source: 'RULE',
    };

    it('creates a CalendarEvent using stored values when no overrides given', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.createInternal.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({
        ...pending,
        status: DateSuggestionStatus.CONFIRMED,
      });

      await service.confirm('case-1', 'sug-1', 'user-1', {});

      expect(mockCalendar.createInternal).toHaveBeenCalledWith({
        caseId: 'case-1',
        title: 'วันนัดไต่สวน',
        startAt: pending.suggestedDate.toISOString(),
        type: EventType.COURT_DATE,
        reminderMinutes: undefined,
        assigneeId: undefined,
      }, 'user-1', mockPrisma);
    });

    it('locks the trigger before the suggestion and reads its current revision', async () => {
      const current = { ...pending, triggerEventId: 'trigger-1', updatedAt: new Date('2026-09-12T00:00:00.000Z') };
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(current);
      mockCalendar.createInternal.mockResolvedValue({ id: 'event-1' });
      await service.confirm('case-1', 'sug-1', 'user-1', { expectedUpdatedAt: current.updatedAt.toISOString() });
      expect(mockPrisma.$queryRaw.mock.calls.map(call => call[0].join('?'))).toEqual([
        'SELECT "id" FROM "CalendarEvent" WHERE "id" = ? FOR UPDATE',
        'SELECT "id" FROM "DocumentDateSuggestion" WHERE "id" = ? FOR UPDATE',
      ]);
      expect(mockPrisma.documentDateSuggestion.findUnique).toHaveBeenCalledTimes(2);
    });

    it('rejects a stale browser revision after waiting for a reschedule', async () => {
      const initial = { ...pending, triggerEventId: 'trigger-1', updatedAt: new Date('2026-09-12T00:00:00.000Z') };
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValueOnce(initial)
        .mockResolvedValueOnce({ ...initial, updatedAt: new Date('2026-09-13T00:00:00.000Z') });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', { date: pending.suggestedDate.toISOString(), expectedUpdatedAt: initial.updatedAt.toISOString() })).rejects.toThrow(ConflictException);
      expect(mockCalendar.createInternal).not.toHaveBeenCalled();
    });

    it('requires a reviewed revision for a rule-derived suggestion', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({ ...pending, triggerEventId: 'trigger-1' });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(ConflictException);
      expect(mockCalendar.createInternal).not.toHaveBeenCalled();
    });

    it('does not create another event when confirmation wins while waiting for the lock', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValueOnce(pending)
        .mockResolvedValueOnce({ ...pending, status: DateSuggestionStatus.CONFIRMED });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(ConflictException);
      expect(mockCalendar.createInternal).not.toHaveBeenCalled();
    });

    it('applies overrides on top of the stored values', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.createInternal.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue(pending);

      await service.confirm('case-1', 'sug-1', 'user-1', {
        label: 'แก้ไขแล้ว',
        date: '2026-11-01T00:00:00.000Z',
        eventType: EventType.DEADLINE,
      });

      expect(mockCalendar.createInternal).toHaveBeenCalledWith({
        caseId: 'case-1',
        title: 'แก้ไขแล้ว',
        startAt: '2026-11-01T00:00:00.000Z',
        type: EventType.DEADLINE,
        reminderMinutes: undefined,
        assigneeId: undefined,
      }, 'user-1', mockPrisma);
    });

    it('requires a lawyer for a document date and rejects a lawyer outside the case firm', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({ ...pending, source: 'DOCUMENT' });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(BadRequestException);
      mockPrisma.case.findUnique.mockResolvedValue({ firmId: 'firm-1' });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.confirm('case-1', 'sug-1', 'user-1', { assigneeId: 'lawyer-2' })).rejects.toThrow(BadRequestException);
      expect(mockCalendar.createInternal).not.toHaveBeenCalled();
    });

    it('creates the confirmed document date for the selected lawyer', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({ ...pending, source: 'DOCUMENT' });
      mockPrisma.case.findUnique.mockResolvedValue({ firmId: 'firm-1' });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'lawyer-1' });
      mockCalendar.createInternal.mockResolvedValue({ id: 'event-1' });
      await service.confirm('case-1', 'sug-1', 'user-1', { assigneeId: 'lawyer-1' });
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: 'lawyer-1', firmMembers: { some: { firmId: 'firm-1', role: { in: ['OWNER', 'SENIOR_LAWYER', 'LAWYER'] } } } }),
      }));
      expect(mockCalendar.createInternal).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: 'lawyer-1' }), 'user-1', mockPrisma,
      );
    });

    it('marks the suggestion CONFIRMED, storing the created event id and reviewer', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.createInternal.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({});

      await service.confirm('case-1', 'sug-1', 'user-1', {});

      expect(mockPrisma.documentDateSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({
          status: DateSuggestionStatus.CONFIRMED,
          calendarEventId: 'event-1',
          reviewedById: 'user-1',
        }),
      });
    });

    it('throws NotFoundException when the suggestion belongs to a different case', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        ...pending,
        caseId: 'other-case',
      });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when the suggestion is not PENDING', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        ...pending,
        status: DateSuggestionStatus.DISMISSED,
      });
      await expect(service.confirm('case-1', 'sug-1', 'user-1', {})).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('dismiss', () => {
    it('marks a PENDING suggestion DISMISSED with the reviewer', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        id: 'sug-1',
        caseId: 'case-1',
        status: DateSuggestionStatus.PENDING,
      });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({});

      await service.dismiss('case-1', 'sug-1', 'user-1');

      expect(mockPrisma.documentDateSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug-1' },
        data: expect.objectContaining({
          status: DateSuggestionStatus.DISMISSED,
          reviewedById: 'user-1',
        }),
      });
    });

    it('does not dismiss a suggestion confirmed while waiting for the lock', async () => {
      const row = { id: 'sug-1', caseId: 'case-1', status: DateSuggestionStatus.PENDING };
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValueOnce(row)
        .mockResolvedValueOnce({ ...row, status: DateSuggestionStatus.CONFIRMED });
      await expect(service.dismiss('case-1', 'sug-1', 'user-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.documentDateSuggestion.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when already CONFIRMED', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue({
        id: 'sug-1',
        caseId: 'case-1',
        status: DateSuggestionStatus.CONFIRMED,
      });
      await expect(service.dismiss('case-1', 'sug-1', 'user-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
