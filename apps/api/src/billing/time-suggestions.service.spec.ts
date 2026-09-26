import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { TimeSuggestionsService } from './time-suggestions.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { FirmLinkService } from '../notifications/firm-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { eventForUserWhere } from '../calendar/event-people';

const lawyer = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as AuthUser;
const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;

/** `YYYY-MM-DD` `days` calendar days after `dateStr`. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('TimeSuggestionsService', () => {
  const mockPrisma = {
    calendarEvent: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    reviewDecision: { findMany: jest.fn() },
    caseMessage: { findMany: jest.fn() },
    timeEntry: { findMany: jest.fn(), createMany: jest.fn() },
    firmMember: { findMany: jest.fn() },
  } as any;
  const mockCaseAccess = {
    getCaseFilterForUser: jest.fn().mockReturnValue({}),
    getCaseFilterForFinancials: jest.fn().mockReturnValue({}),
    canAccessCase: jest.fn(),
  };
  const mockLine = { pushTo: jest.fn() };
  const mockFirmLink = { linkFor: jest.fn().mockResolvedValue('https://acme.example.com/timesheet') };
  let service: TimeSuggestionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.timeEntry.findMany.mockResolvedValue([]);
    mockPrisma.calendarEvent.findMany.mockResolvedValue([]);
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.reviewDecision.findMany.mockResolvedValue([]);
    mockPrisma.caseMessage.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeSuggestionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: LineMessagingService, useValue: mockLine },
        { provide: FirmLinkService, useValue: mockFirmLink },
      ],
    }).compile();
    service = module.get(TimeSuggestionsService);
  });

  describe('suggest', () => {
    it('rounds an event with a 3 hour endAt to 3 hours', async () => {
      mockPrisma.calendarEvent.findMany.mockResolvedValue([
        {
          id: 'e1',
          title: 'ไต่สวน',
          type: 'COURT_DATE',
          startAt: new Date('2026-09-26T02:00:00.000Z'),
          endAt: new Date('2026-09-26T05:00:00.000Z'),
          caseId: 'case-1',
          case: { ownRef: 'CASE-001' },
        },
      ]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: 'event',
        sourceKey: 'event:e1',
        hours: 3,
        caseId: 'case-1',
        caseRef: 'CASE-001',
        description: 'ไปศาล: ไต่สวน',
      });
    });

    it('leaves hours null when the event has no endAt', async () => {
      mockPrisma.calendarEvent.findMany.mockResolvedValue([
        {
          id: 'e2',
          title: 'พบลูกความ',
          type: 'CLIENT_MEETING',
          startAt: new Date('2026-09-26T02:00:00.000Z'),
          endAt: null,
          caseId: 'case-1',
          case: { ownRef: 'CASE-001' },
        },
      ]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result[0].hours).toBeNull();
      expect(result[0].description).toBe('ประชุมลูกความ: พบลูกความ');
    });

    it('groups messages per case', async () => {
      mockPrisma.caseMessage.findMany.mockResolvedValue([
        { caseId: 'case-1', case: { ownRef: 'CASE-001' } },
        { caseId: 'case-1', case: { ownRef: 'CASE-001' } },
        { caseId: 'case-2', case: { ownRef: 'CASE-002' } },
      ]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result).toHaveLength(2);
      const byCase = Object.fromEntries(result.map((r) => [r.caseId, r]));
      expect(byCase['case-1']).toMatchObject({
        sourceKey: 'messages:case-1:2026-09-26',
        description: 'ตอบลูกความ (2 ข้อความ)',
      });
      expect(byCase['case-2'].description).toBe('ตอบลูกความ (1 ข้อความ)');
    });

    it('suggests a completed task with a null hours', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', title: 'ยื่นคำร้อง', caseId: 'case-1', case: { ownRef: 'CASE-001' } },
      ]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: 'task',
        sourceKey: 'task:t1',
        caseId: 'case-1',
        caseRef: 'CASE-001',
        description: 'ปิดงาน: ยื่นคำร้อง',
        hours: null,
      });
    });

    it('suggests a review decision using the document filename', async () => {
      mockPrisma.reviewDecision.findMany.mockResolvedValue([
        {
          id: 'r1',
          reviewRound: {
            documentVersion: {
              document: { caseId: 'case-1', filename: 'สัญญาเช่า.pdf', case: { ownRef: 'CASE-001' } },
            },
          },
        },
      ]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        source: 'review',
        sourceKey: 'review:r1',
        caseId: 'case-1',
        caseRef: 'CASE-001',
        description: 'ตรวจเอกสาร: สัญญาเช่า.pdf',
        hours: null,
      });
    });

    it('skips a review decision whose document has no caseId', async () => {
      mockPrisma.reviewDecision.findMany.mockResolvedValue([
        {
          id: 'r2',
          reviewRound: {
            documentVersion: {
              document: { caseId: null, filename: 'draft.pdf', case: null },
            },
          },
        },
      ]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result).toHaveLength(0);
    });

    it('excludes a suggestion already confirmed as a time entry', async () => {
      mockPrisma.calendarEvent.findMany.mockResolvedValue([
        {
          id: 'e1',
          title: 'ไต่สวน',
          type: 'COURT_DATE',
          startAt: new Date('2026-09-26T02:00:00.000Z'),
          endAt: new Date('2026-09-26T05:00:00.000Z'),
          caseId: 'case-1',
          case: { ownRef: 'CASE-001' },
        },
      ]);
      mockPrisma.timeEntry.findMany.mockResolvedValue([{ sourceKey: 'event:e1' }]);
      const result = await service.suggest(lawyer, '2026-09-26');
      expect(result).toHaveLength(0);
    });

    it('scopes event visibility with eventForUserWhere, so every assignee sees it', async () => {
      await service.suggest(lawyer, '2026-09-26');
      const where = mockPrisma.calendarEvent.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject(eventForUserWhere(lawyer.id));
    });
  });

  describe('confirm', () => {
    it('rejects an entry for a case the user cannot access', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(false);
      await expect(
        service.confirm(lawyer, [
          { caseId: 'case-1', hours: 1, description: 'x', date: '2026-09-26' } as any,
        ]),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.timeEntry.createMany).not.toHaveBeenCalled();
    });

    it('creates entries and skips duplicates', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.timeEntry.createMany.mockResolvedValue({ count: 1 });
      const result = await service.confirm(lawyer, [
        { caseId: 'case-1', hours: 1, description: 'x', date: '2026-09-26', sourceKey: 'event:e1' } as any,
      ]);
      expect(mockPrisma.timeEntry.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
      expect(result).toEqual({ created: 1 });
    });
  });

  describe('timesheet', () => {
    it('forces own userId for a non-owner even when userId is requested', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([]);
      await service.timesheet(lawyer, { from: '2026-09-01', to: '2026-09-26', userId: 'someone-else' });
      expect(mockPrisma.timeEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
      );
    });

    it('lets an owner see all users when userId is omitted', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([]);
      await service.timesheet(owner, { from: '2026-09-01', to: '2026-09-26' });
      const call = mockPrisma.timeEntry.findMany.mock.calls[0][0];
      expect(call.where.userId).toBeUndefined();
    });

    it('rejects a range longer than 93 days', async () => {
      await expect(
        service.timesheet(owner, { from: '2026-01-01', to: '2026-09-26' }),
      ).rejects.toThrow('ช่วงวันที่ต้องไม่เกิน 93 วัน');
    });

    it('allows a range of exactly 93 inclusive days', async () => {
      const from = '2026-01-01';
      const to = addDays(from, 92); // 92 days later == 93 calendar days inclusive
      await expect(service.timesheet(owner, { from, to })).resolves.toBeDefined();
    });

    it('rejects a range of 94 inclusive days', async () => {
      const from = '2026-01-01';
      const to = addDays(from, 93); // 93 days later == 94 calendar days inclusive
      await expect(
        service.timesheet(owner, { from, to }),
      ).rejects.toThrow('ช่วงวันที่ต้องไม่เกิน 93 วัน');
    });
  });

  describe('sendDailyDigest', () => {
    it('skips members with zero suggestions and pushes only for the rest', async () => {
      mockPrisma.firmMember.findMany.mockResolvedValue([
        { firmId: 'firm-1', userId: 'u1', role: 'LAWYER', user: { lineUserId: 'line-1' } },
        { firmId: 'firm-1', userId: 'u2', role: 'LAWYER', user: { lineUserId: 'line-2' } },
      ]);
      jest
        .spyOn(service, 'suggest')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ sourceKey: 'a', source: 'task', caseId: 'c', caseRef: null, description: 'x', hours: null, date: '2026-09-26' }]);
      mockLine.pushTo.mockResolvedValue(true);

      const sent = await service.sendDailyDigest(new Date('2026-09-26T11:00:00.000Z'));

      expect(mockLine.pushTo).toHaveBeenCalledTimes(1);
      expect(mockLine.pushTo).toHaveBeenCalledWith('line-2', expect.stringContaining('1 รายการ'));
      expect(sent).toBe(1);
    });
  });
});
