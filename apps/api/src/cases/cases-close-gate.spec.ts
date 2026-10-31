import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CasesService } from './cases.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CaseActivitiesService } from './case-activities.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { ConflictCheckService } from '../conflict-check/conflict-check.service';
import { CalendarService } from '../calendar/calendar.service';
import { CloseCaseDto } from './dto/close-case.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/** ปิดคดีทับของค้างเงียบ ๆ คือการซ่อนของค้าง ไม่ใช่การทำให้เสร็จ */
describe('CasesService.close — ด่านของค้าง', () => {
  const user = { id: 'u1', firmId: 'firm-1', firmRole: 'OWNER' } as any;
  let service: CasesService;
  let prisma: any;
  const feed = { log: jest.fn() };
  const calendar = { remove: jest.fn() };
  const now = new Date('2026-10-31T10:00:00Z');

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    calendar.remove.mockResolvedValue({ deleted: true });
    prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'case-1', status: 'OPEN', stage: 'HEARING', title: 'คดี' }),
        update: jest.fn().mockResolvedValue({ id: 'case-1', status: 'CLOSED' }),
      },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      calendarEvent: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: CalendarService, useValue: calendar },
        { provide: PrismaService, useValue: prisma },
        { provide: CaseFeedService, useValue: feed },
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
        { provide: ConflictCheckService, useValue: { gateNewCase: jest.fn().mockResolvedValue({ result: 'CLEAR', terms: [], matches: [], overrideReason: null }), recordForCase: jest.fn() } },
      ],
    }).compile();
    service = module.get(CasesService);
  });

  afterEach(() => jest.useRealTimers());

  const summary = 'สรุปคดีอย่างน้อยสิบตัวอักษร';

  it('ปิดได้เมื่อไม่มีของค้าง และบันทึกผลคดี + ย้ายขั้นตอนไปปิดคดี', async () => {
    await service.close(user, 'case-1', { closingSummary: summary, outcome: 'WON' } as any);

    const data = prisma.case.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'CLOSED', stage: 'CLOSING', outcome: 'WON' });
    expect(feed.log).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STATUS_CHANGE', caseId: 'case-1' }),
    );
  });

  it('ปิดไม่ได้เมื่อยังมีงานค้าง ถ้าไม่ได้กดรับทราบ', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', title: 'ยื่นคำแถลง', status: 'TODO' }]);

    await expect(
      service.close(user, 'case-1', { closingSummary: summary } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });

  it('วันนัดในอนาคตและเอกสารที่ยังไม่อนุมัติก็นับเป็นของค้าง', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 'e1', title: 'นัดสืบพยาน' }]);
    prisma.document.findMany.mockResolvedValue([{ id: 'd1', filename: 'ร่างคำฟ้อง.pdf' }]);

    const outstanding = await service.outstanding(user, 'case-1');
    expect(outstanding.total).toBe(2);
  });

  it('รวมเวลา ค่าใช้จ่าย ใบค้างชำระหลังหักทุกยอดรับ และใบร่าง โดย total นับทุกรายการ', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1' }]);
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 'e1' }]);
    prisma.document.findMany.mockResolvedValue([{ id: 'd1' }]);
    prisma.timeEntry.findMany.mockResolvedValue([{ hours: 1.5, rate: 1000 }, { hours: 0.5, rate: 2000 }]);
    prisma.expense.findMany.mockResolvedValue([{ amount: 100.1 }, { amount: 200.2 }]);
    prisma.invoice.findMany.mockResolvedValue([
      { status: 'SENT', totalAmount: 1000, payments: [{ amount: 200 }, { amount: 300 }] },
      { status: 'SENT', totalAmount: 250, payments: [] },
      { status: 'SENT', totalAmount: 100, payments: [{ amount: 100 }] },
      { status: 'SENT', totalAmount: 50, payments: [{ amount: 100 }] },
      { status: 'DRAFT', totalAmount: 400, payments: [] },
      { status: 'PAID', totalAmount: 300, payments: [] },
    ]);

    expect(await service.outstanding(user, 'case-1')).toMatchObject({
      unbilledTime: { hours: 2, amount: 2500 },
      unbilledExpenses: { count: 2, amount: 300.3 },
      unpaidInvoices: { count: 2, outstandingAmount: 750 },
      draftInvoices: { count: 1 },
      total: 10,
    });
  });

  it('คิวรีทุกกลุ่มจำกัดสำนักงานและคดี และใช้เงื่อนไข unbilled ที่ตัด write-off', async () => {
    await service.outstanding(user, 'case-1');

    for (const model of ['task', 'calendarEvent', 'document', 'timeEntry', 'expense']) {
      expect(prisma[model].findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ caseId: 'case-1', case: { firmId: 'firm-1' } }),
      }));
    }
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({
      billable: true, invoiceId: null, writtenOffAt: null,
    });
    expect(prisma.expense.findMany.mock.calls[0][0].where).toMatchObject({
      billable: true, invoiceId: null, writtenOffAt: null, status: { in: ['APPROVED', 'PAID'] },
    });
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ caseId: 'case-1', firmId: 'firm-1' }),
      select: expect.objectContaining({ payments: { select: { amount: true } } }),
    }));
  });

  it.each(['time', 'expense', 'unpaid', 'draft'])('ของค้าง billing กลุ่ม %s บล็อกการปิดจนรับทราบ', async (group) => {
    if (group === 'time') prisma.timeEntry.findMany.mockResolvedValue([{ hours: 0, rate: 0 }]);
    if (group === 'expense') prisma.expense.findMany.mockResolvedValue([{ amount: 0 }]);
    if (group === 'unpaid') prisma.invoice.findMany.mockResolvedValue([{ status: 'SENT', totalAmount: 10, payments: [] }]);
    if (group === 'draft') prisma.invoice.findMany.mockResolvedValue([{ status: 'DRAFT', totalAmount: 0, payments: [] }]);

    await expect(service.close(user, 'case-1', {
      closingSummary: summary, outcome: 'WON', removeFutureEvents: true,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(calendar.remove).not.toHaveBeenCalled();

    await service.close(user, 'case-1', {
      closingSummary: summary, outcome: 'WON', acknowledgeOutstanding: true,
    } as any);
    expect(prisma.case.update).toHaveBeenCalledTimes(1);
    expect(feed.log.mock.calls[0][0].description).toContain('ของค้าง 1 รายการ');
  });

  it('ยอด billing ว่างส่งกลับศูนย์ และใบ SENT ที่จ่ายครบไม่บล็อกปิด', async () => {
    prisma.invoice.findMany.mockResolvedValue([{ status: 'SENT', totalAmount: 0.3, payments: [{ amount: 0.1 }, { amount: 0.2 }] }]);
    expect(await service.outstanding(user, 'case-1')).toMatchObject({
      unbilledTime: { hours: 0, amount: 0 },
      unbilledExpenses: { count: 0, amount: 0 },
      unpaidInvoices: { count: 0, outstandingAmount: 0 },
      draftInvoices: { count: 0 }, total: 0,
    });
    await expect(service.close(user, 'case-1', { closingSummary: summary, outcome: 'WON' } as any)).resolves.toBeDefined();
  });

  it('ลบเฉพาะนัดของคดีนี้ที่เริ่มตั้งแต่เวลาปิด ผ่าน CalendarService และบันทึกจำนวนใน feed', async () => {
    const events = [
      { id: 'past', caseId: 'case-1', startAt: new Date(now.getTime() - 1) },
      { id: 'at-close', caseId: 'case-1', startAt: now },
      { id: 'future', caseId: 'case-1', startAt: new Date(now.getTime() + 1000) },
      { id: 'other-case', caseId: 'case-2', startAt: new Date(now.getTime() + 1000) },
    ];
    prisma.calendarEvent.findMany.mockImplementation(async ({ where }: { where: { caseId: string; startAt: { gte: Date } } }) => events.filter(
      event => event.caseId === where.caseId && event.startAt >= where.startAt.gte,
    ));

    await service.close(user, 'case-1', {
      closingSummary: summary, outcome: 'WON', acknowledgeOutstanding: true, removeFutureEvents: true,
    } as any);

    expect(calendar.remove.mock.calls).toEqual([[user, 'at-close'], [user, 'future']]);
    expect(feed.log.mock.calls[0][0].description).toContain('ลบนัดในอนาคต 2 รายการ');
  });

  it.each([false, undefined])('ไม่ลบนัดเมื่อ removeFutureEvents เป็น %s', async (removeFutureEvents) => {
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 'future', startAt: now }]);
    await service.close(user, 'case-1', {
      closingSummary: summary, outcome: 'WON', acknowledgeOutstanding: true, removeFutureEvents,
    } as any);
    expect(calendar.remove).not.toHaveBeenCalled();
  });

  it('ลบนัดไม่สำเร็จต้องไม่ปิดคดีหรือบันทึกว่าปิดสำเร็จ', async () => {
    prisma.calendarEvent.findMany.mockResolvedValue([{ id: 'future', startAt: now }]);
    calendar.remove.mockRejectedValueOnce(new Error('calendar unavailable'));
    await expect(service.close(user, 'case-1', {
      closingSummary: summary, outcome: 'WON', acknowledgeOutstanding: true, removeFutureEvents: true,
    } as any)).rejects.toThrow('calendar unavailable');
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(feed.log).not.toHaveBeenCalled();
  });

  it('removeFutureEvents เป็น boolean ที่ผ่าน whitelist และปฏิเสธข้อความ', async () => {
    for (const value of [undefined, false, true]) {
      const dto = plainToInstance(CloseCaseDto, { closingSummary: summary, outcome: 'WON', removeFutureEvents: value });
      expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    }
    const dto = plainToInstance(CloseCaseDto, { closingSummary: summary, outcome: 'WON', removeFutureEvents: 'true' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.find(error => error.property === 'removeFutureEvents')?.constraints).toHaveProperty('isBoolean');
  });

  it('กดรับทราบแล้วปิดได้ และของค้างถูกบันทึกไว้ใน feed', async () => {
    prisma.task.findMany.mockResolvedValue([{ id: 't1', title: 'ยื่นคำแถลง', status: 'TODO' }]);

    await service.close(user, 'case-1', {
      closingSummary: summary,
      acknowledgeOutstanding: true,
    } as any);

    expect(prisma.case.update).toHaveBeenCalled();
    expect(feed.log.mock.calls[0][0].description).toContain('ของค้าง 1 รายการ');
  });

  it('คดีที่ปิดแล้วปิดซ้ำไม่ได้', async () => {
    prisma.case.findUnique.mockResolvedValue({ id: 'case-1', status: 'CLOSED', stage: 'CLOSING' });
    await expect(
      service.close(user, 'case-1', { closingSummary: summary } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
