import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { TimeSuggestionsService } from './time-suggestions.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { FirmLinkService } from '../notifications/firm-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
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
    firmMember: { findMany: jest.fn(), findUnique: jest.fn() },
    mailboxConnection: { findMany: jest.fn() },
    emailMessage: { findMany: jest.fn() },
  } as any;
  const mockCaseAccess = {
    getCaseFilterForUser: jest.fn().mockReturnValue({}),
    getCaseFilterForFinancials: jest.fn().mockReturnValue({}),
    canAccessCase: jest.fn(),
    getEmailThreadFilterForUser: jest.fn().mockResolvedValue({ firmId: 'firm-1', visible: true }),
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
    mockPrisma.mailboxConnection.findMany.mockResolvedValue([]);
    mockPrisma.emailMessage.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeSuggestionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: LineMessagingService, useValue: mockLine },
        { provide: FirmLinkService, useValue: mockFirmLink },
        {
          provide: BillingService,
          useValue: new BillingService(mockPrisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any),
        },
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

  describe('suggest — email source', () => {
    /** Sent by u1 on 2026-10-31 10:00 Bangkok, filed to case-1. */
    const sent = (over: Record<string, unknown> = {}) => ({
      direction: 'OUTBOUND',
      fromAddress: 'u1@firm.co.th',
      receivedAt: new Date('2026-10-31T03:00:00.000Z'),
      thread: { caseId: 'case-1', case: { ownRef: 'CASE-001' } },
      ...over,
    });
    const emailOnly = (result: { source: string }[]) => result.filter((s) => s.source === 'email');

    beforeEach(() => {
      mockPrisma.mailboxConnection.findMany.mockResolvedValue([{ mailboxAddress: 'U1@Firm.co.th' }]);
    });

    it('email source: one suggestion per case per Bangkok day with hours from emailSuggestionHours', async () => {
      mockPrisma.emailMessage.findMany.mockResolvedValue([
        sent(),
        sent(),
        sent(),
        sent({ thread: { caseId: 'case-2', case: { ownRef: 'CASE-002' } } }),
      ]);
      const result = emailOnly(await service.suggest(lawyer, '2026-10-31'));
      expect(result).toHaveLength(2);
      const byCase = Object.fromEntries(result.map((r: any) => [r.caseId, r]));
      expect(byCase['case-1']).toEqual({
        sourceKey: 'email:case-1:2026-10-31',
        source: 'email',
        caseId: 'case-1',
        caseRef: 'CASE-001',
        description: 'ส่งอีเมลคดี 3 ฉบับ',
        hours: 0.5,
        date: '2026-10-31',
      });
      expect(byCase['case-2']).toMatchObject({ description: 'ส่งอีเมลคดี 1 ฉบับ', hours: 0.25 });
    });

    it("email source: only messages whose fromAddress matches (case-insensitive) a mailboxAddress of the user's own MailboxConnection", async () => {
      mockPrisma.emailMessage.findMany.mockResolvedValue([
        // Our mail, synced into a thread a colleague filed from their mailbox — counts for us.
        sent({ fromAddress: 'U1@FIRM.CO.TH', thread: { caseId: 'case-1', case: { ownRef: 'CASE-001' } } }),
        // A colleague's sent mail inside a thread filed from our mailbox — not ours.
        sent({ fromAddress: 'colleague@firm.co.th' }),
      ]);
      const result = emailOnly(await service.suggest(lawyer, '2026-10-31'));
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ caseId: 'case-1', description: 'ส่งอีเมลคดี 1 ฉบับ' });
      expect(mockPrisma.mailboxConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { firmId: 'firm-1', userId: 'u1' } }),
      );
    });

    it('email source: skips the email query when the user owns no mailbox', async () => {
      mockPrisma.mailboxConnection.findMany.mockResolvedValue([]);
      mockPrisma.emailMessage.findMany.mockResolvedValue([sent()]);
      expect(emailOnly(await service.suggest(lawyer, '2026-10-31'))).toEqual([]);
      expect(mockPrisma.emailMessage.findMany).not.toHaveBeenCalled();
    });

    it('email source: ignores INBOUND, threads with caseId null, and cases outside CaseAccessService filter', async () => {
      mockPrisma.emailMessage.findMany.mockResolvedValue([
        sent({ direction: 'INBOUND' }),
        sent({ thread: { caseId: null, case: null } }),
      ]);
      expect(emailOnly(await service.suggest(lawyer, '2026-10-31'))).toEqual([]);

      expect(mockCaseAccess.getEmailThreadFilterForUser).toHaveBeenCalledWith(lawyer);
      const where = mockPrisma.emailMessage.findMany.mock.calls[0][0].where;
      expect(where.direction).toBe('OUTBOUND');
      expect(where.thread).toEqual({
        AND: [{ firmId: 'firm-1', visible: true }, { caseId: { not: null } }],
      });
    });

    it('email source: 23:30 Bangkok counts on that date, 00:10 Bangkok on the next', async () => {
      const lateNight = sent({ receivedAt: new Date('2026-10-31T16:30:00.000Z') }); // 31 Oct 23:30 +07
      const afterMidnight = sent({ receivedAt: new Date('2026-10-31T17:10:00.000Z') }); // 1 Nov 00:10 +07
      mockPrisma.emailMessage.findMany.mockResolvedValue([lateNight, afterMidnight]);

      const oct31 = emailOnly(await service.suggest(lawyer, '2026-10-31'));
      expect(oct31).toEqual([expect.objectContaining({ sourceKey: 'email:case-1:2026-10-31', description: 'ส่งอีเมลคดี 1 ฉบับ' })]);
      expect(mockPrisma.emailMessage.findMany.mock.calls[0][0].where.receivedAt).toEqual({
        gte: new Date('2026-10-30T17:00:00.000Z'),
        lt: new Date('2026-10-31T17:00:00.000Z'),
      });

      const nov1 = emailOnly(await service.suggest(lawyer, '2026-11-01'));
      expect(nov1).toEqual([expect.objectContaining({ sourceKey: 'email:case-1:2026-11-01', description: 'ส่งอีเมลคดี 1 ฉบับ' })]);
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

    it('confirm uses FirmMember.defaultHourlyRate as rate when the item has no rate', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.timeEntry.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.firmMember.findUnique.mockResolvedValue({ defaultHourlyRate: 1500 });
      await service.confirm(lawyer, [
        { caseId: 'case-1', hours: 1, description: 'x', date: '2026-10-31' } as any,
        { caseId: 'case-1', hours: 1, description: 'y', date: '2026-10-31', rate: 800 } as any,
      ]);
      expect(mockPrisma.firmMember.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { firmId_userId: { firmId: 'firm-1', userId: 'u1' } } }),
      );
      const rates = mockPrisma.timeEntry.createMany.mock.calls[0][0].data.map((d: any) => d.rate);
      expect(rates).toEqual([1500, 800]);
    });

    it('confirm defaults rate to 0 when the member has no defaultHourlyRate', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.timeEntry.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.firmMember.findUnique.mockResolvedValue({ defaultHourlyRate: null });
      await service.confirm(lawyer, [{ caseId: 'case-1', hours: 1, description: 'x', date: '2026-10-31' } as any]);
      expect(mockPrisma.timeEntry.createMany.mock.calls[0][0].data[0].rate).toBe(0);
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
