import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { DateSuggestionStatus, EventType } from '@lawfirm/shared';
import { DateSuggestionsService } from './date-suggestions.service';
import { PrismaService } from '../prisma/prisma.module';
import { CalendarService } from '../calendar/calendar.service';

describe('DateSuggestionsService', () => {
  let service: DateSuggestionsService;
  const mockPrisma = {
    documentDateSuggestion: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const mockCalendar = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
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
    };

    it('creates a CalendarEvent using stored values when no overrides given', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue({
        ...pending,
        status: DateSuggestionStatus.CONFIRMED,
      });

      await service.confirm('case-1', 'sug-1', 'user-1', {});

      expect(mockCalendar.create).toHaveBeenCalledWith({
        caseId: 'case-1',
        title: 'วันนัดไต่สวน',
        startAt: pending.suggestedDate.toISOString(),
        type: EventType.COURT_DATE,
        reminderMinutes: undefined,
      });
    });

    it('applies overrides on top of the stored values', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.create.mockResolvedValue({ id: 'event-1' });
      mockPrisma.documentDateSuggestion.update.mockResolvedValue(pending);

      await service.confirm('case-1', 'sug-1', 'user-1', {
        label: 'แก้ไขแล้ว',
        date: '2026-11-01T00:00:00.000Z',
        eventType: EventType.DEADLINE,
      });

      expect(mockCalendar.create).toHaveBeenCalledWith({
        caseId: 'case-1',
        title: 'แก้ไขแล้ว',
        startAt: '2026-11-01T00:00:00.000Z',
        type: EventType.DEADLINE,
        reminderMinutes: undefined,
      });
    });

    it('marks the suggestion CONFIRMED, storing the created event id and reviewer', async () => {
      mockPrisma.documentDateSuggestion.findUnique.mockResolvedValue(pending);
      mockCalendar.create.mockResolvedValue({ id: 'event-1' });
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
