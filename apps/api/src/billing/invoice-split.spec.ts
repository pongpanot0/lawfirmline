import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { BillingService } from './billing.service';
import { PettyCashService } from './petty-cash.service';
import { CashAdvanceService } from './cash-advance.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;

/** ค่าทนาย ฿100,000 หนึ่งรายการ */
const fee = (amount = 100000) => ({
  lineItems: [{ description: 'ค่าดำเนินคดี', quantity: 1, unitPrice: amount }],
});

describe('BillingService.createInvoice — วางบิลลูกค้า (ผู้ว่าจ้าง)', () => {
  let billing: BillingService;
  let nextNumber: number;
  const mockPrisma = {
    caseCustomer: { findMany: jest.fn() },
    invoice: { create: jest.fn() },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    expense: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    case: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    ),
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    nextNumber = 1;
    // sequence ของ Postgres จ่ายเลขไม่ซ้ำให้ทีละใบ
    mockPrisma.$queryRaw.mockImplementation(async (_s: unknown, howMany: number) =>
      Array.from({ length: howMany }, () => ({ n: BigInt(nextNumber++) })),
    );
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({
      id: `invoice-${data.invoiceNumber}`,
      ...data,
    }));
    mockPrisma.timeEntry.findMany.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PettyCashService, useValue: {} },
        { provide: CashAdvanceService, useValue: {} },
        { provide: CaseAccessService, useValue: { getCaseFilterForUser: jest.fn().mockReturnValue({}) } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LineMessagingService, useValue: { isConfigured: () => false, pushTo: jest.fn() } },
        { provide: FileStorageService, useValue: {} },
        { provide: AssignmentNotifierService, useValue: { notifyFirmOwners: jest.fn() } },
      ],
    }).compile();
    billing = module.get(BillingService);
  });

  it('bills the single customer of the case for the full amount', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'viriyah', sharePercent: 100 },
    ]);

    const invoices = await billing.createInvoice(user, 'case-1', fee() as any);

    expect(invoices).toHaveLength(1);
    expect((invoices[0] as any).billToCustomerId).toBe('viriyah');
    expect((invoices[0] as any).totalAmount).toBe(100000);
    // ใบเดียวเก็บรายการงานไว้ครบเหมือนเดิม
    expect((invoices[0] as any).lineItems.create).toHaveLength(1);
  });

  it('issues one invoice per customer, splitting by the share on the case', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'viriyah', sharePercent: 60 },
      { customerId: 'bangkok-insurance', sharePercent: 40 },
    ]);

    const invoices = await billing.createInvoice(user, 'case-1', fee() as any);

    expect(invoices.map((i: any) => [i.billToCustomerId, i.totalAmount])).toEqual([
      ['viriyah', 60000],
      ['bangkok-insurance', 40000],
    ]);
    expect(invoices.map((i: any) => i.invoiceNumber)).toEqual(['INV-00001', 'INV-00002']);
  });

  it('never loses a satang: the last payer absorbs the rounding', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'a', sharePercent: 33.33 },
      { customerId: 'b', sharePercent: 33.33 },
      { customerId: 'c', sharePercent: 33.34 },
    ]);

    const invoices = await billing.createInvoice(user, 'case-1', fee() as any);

    const total = invoices.reduce((sum: number, i: any) => sum + i.totalAmount, 0);
    expect(Math.round(total * 100) / 100).toBe(100000);
  });

  it('splits equally when nobody agreed on a share yet', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'a', sharePercent: null },
      { customerId: 'b', sharePercent: null },
    ]);

    const invoices = await billing.createInvoice(user, 'case-1', fee() as any);

    expect(invoices.map((i: any) => i.totalAmount)).toEqual([50000, 50000]);
  });

  it('honours an explicit split that overrides the shares on the case', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'a', sharePercent: 50 },
      { customerId: 'b', sharePercent: 50 },
    ]);

    const invoices = await billing.createInvoice(user, 'case-1', {
      ...fee(),
      splits: [
        { customerId: 'a', sharePercent: 70 },
        { customerId: 'b', sharePercent: 30 },
      ],
    } as any);

    expect(invoices.map((i: any) => i.totalAmount)).toEqual([70000, 30000]);
  });

  it('refuses to bill someone who is not a customer of the case', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([{ customerId: 'a', sharePercent: 100 }]);

    await expect(
      billing.createInvoice(user, 'case-1', {
        ...fee(),
        splits: [{ customerId: 'stranger', sharePercent: 100 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a split whose shares are all zero', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'a', sharePercent: 0 },
      { customerId: 'b', sharePercent: 0 },
    ]);

    await expect(billing.createInvoice(user, 'case-1', fee() as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('still issues an invoice for a case that has no customer recorded', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([]);

    const invoices = await billing.createInvoice(user, 'case-1', fee() as any);

    expect(invoices).toHaveLength(1);
    expect((invoices[0] as any).billToCustomerId).toBeNull();
  });

  describe('ยอดที่เรียกเก็บมาจากงานในคดี', () => {
    beforeEach(() => {
      mockPrisma.caseCustomer.findMany.mockResolvedValue([
        { customerId: 'viriyah', sharePercent: 100 },
      ]);
    });

    it('prices the work from the database, not from what the client sent', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความนัดสืบพยาน', hours: 6, rate: 2500 },
      ]);
      mockPrisma.expense.findMany.mockResolvedValue([
        { id: 'e1', description: 'ค่าเดินทางไปศาล', amount: 1200 },
      ]);

      const invoices = await billing.createInvoice(user, 'case-1', {
        timeEntryIds: ['t1'],
        expenseIds: ['e1'],
      } as any);

      expect((invoices[0] as any).totalAmount).toBe(16200);
      expect((invoices[0] as any).lineItems.create).toEqual([
        { description: 'ว่าความนัดสืบพยาน', quantity: 6, unitPrice: 2500, amount: 15000 },
        { description: 'ค่าเดินทางไปศาล', quantity: 1, unitPrice: 1200, amount: 1200 },
      ]);
    });

    it('marks the billed work so it cannot be charged a second time', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความ', hours: 1, rate: 1000 },
      ]);

      await billing.createInvoice(user, 'case-1', { timeEntryIds: ['t1'] } as any);

      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] } },
        data: { invoiceId: 'invoice-INV-00001' },
      });
    });

    it('links the split work to the primary payer invoice only, never twice', async () => {
      mockPrisma.caseCustomer.findMany.mockResolvedValue([
        { customerId: 'viriyah', sharePercent: 60 },
        { customerId: 'bangkok', sharePercent: 40 },
      ]);
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความ', hours: 1, rate: 1000 },
      ]);

      await billing.createInvoice(user, 'case-1', { timeEntryIds: ['t1'] } as any);

      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.timeEntry.updateMany.mock.calls[0][0].data.invoiceId).toBe('invoice-INV-00001');
    });

    it('refuses work that another invoice already charged for', async () => {
      // ถูกออกบิลไปแล้ว จึงหลุดจาก where invoiceId: null
      mockPrisma.timeEntry.findMany.mockResolvedValue([]);

      await expect(
        billing.createInvoice(user, 'case-1', { timeEntryIds: ['t1'] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    });

    it('refuses an invoice with nothing on it', async () => {
      await expect(billing.createInvoice(user, 'case-1', {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('still accepts a hand-written line alongside the work from the case', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความ', hours: 1, rate: 1000 },
      ]);

      const invoices = await billing.createInvoice(user, 'case-1', {
        timeEntryIds: ['t1'],
        lineItems: [{ description: 'ค่าธรรมเนียมศาล', quantity: 1, unitPrice: 500 }],
      } as any);

      expect((invoices[0] as any).totalAmount).toBe(1500);
    });
  });
});
