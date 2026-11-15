import { FirmLinkService } from '../notifications/firm-link.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
    firm: { findUnique: jest.fn().mockResolvedValue({ vatRegistered: false }) },
    caseCustomer: { findMany: jest.fn() },
    intakeCustomer: { findMany: jest.fn().mockResolvedValue([]) },
    invoice: { create: jest.fn() },
    timeEntry: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    expense: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    case: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
    intake: { findFirst: jest.fn().mockResolvedValue({ id: 'intake-1' }) },
    // Every named customer belongs to the firm unless a test says otherwise.
    client: { count: jest.fn(async ({ where }: any) => where.id.in.filter((id: string) => !id.startsWith('other-firm')).length) },
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
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.intakeCustomer.findMany.mockResolvedValue([]);

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
        { provide: FirmLinkService, useValue: { linkFor: jest.fn().mockResolvedValue('https://acme.example.com/x'), originForFirm: jest.fn(), rootOrigin: jest.fn() } },
      ],
    }).compile();
    billing = module.get(BillingService);
  });

  it('keeps time and expense lines in request order and honors explicit manual sortOrder', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([]);
    mockPrisma.timeEntry.findMany.mockResolvedValue([
      { id: 't1', description: 'Time 1', hours: 1, rate: 100 }, { id: 't2', description: 'Time 2', hours: 1, rate: 200 },
    ]);
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: 'e1', description: 'Expense 1', amount: 10 }, { id: 'e2', description: 'Expense 2', amount: 20 },
    ]);
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 2 });
    await billing.createInvoice(user, { caseId: 'case-1' }, {
      timeEntryIds: ['t2', 't1'], expenseIds: ['e2', 'e1'],
      lineItems: [{ description: 'Last', quantity: 1, unitPrice: 1, sortOrder: 10 }, { description: 'Before last', quantity: 1, unitPrice: 2, sortOrder: 9 }],
    });
    const args = mockPrisma.invoice.create.mock.calls[0][0];
    expect(args.data.lineItems.create.map((l: any) => [l.description, l.sortOrder])).toEqual([
      ['Time 2', 0], ['Time 1', 1], ['Expense 2', 2], ['Expense 1', 3], ['Before last', 4], ['Last', 5],
    ]);
    expect(args.include.lineItems.orderBy).toEqual([{ sortOrder: 'asc' }, { id: 'asc' }]);
  });

  it('applies linked-line overrides, ignores legacy ids, and persists stable cross-source order', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([]);
    mockPrisma.timeEntry.findMany.mockResolvedValue([
      { id: 't1', description: 'Old 1', hours: 2, rate: 100 },
      { id: 't2', description: 'Old 2', hours: 1, rate: 200 },
    ]);
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: 'e1', description: 'Old expense', amount: 50 }, { id: 'e2', description: 'Expense tie', amount: 25 },
    ]);
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 2 });
    await billing.createInvoice(user, { caseId: 'case-1' }, {
      timeEntryIds: ['ignored'], expenseIds: ['ignored'],
      timeEntryLines: [
        { id: 't2', description: 'Second', taxClass: 'ADVISORY_VAT', sortOrder: 5 },
        { id: 't1', sortOrder: 5 },
      ],
      expenseLines: [
        { id: 'e1', description: 'First', taxClass: 'LITIGATION_EXEMPT', sortOrder: 0 },
        { id: 'e2', sortOrder: 5 },
      ],
      lineItems: [{ description: 'Last', quantity: 1, unitPrice: 10, sortOrder: 5 }],
    } as any);
    const rows = mockPrisma.invoice.create.mock.calls[0][0].data.lineItems.create;
    expect(rows.map((l: any) => [l.description, l.taxClass, l.sortOrder])).toEqual([
      ['First', 'LITIGATION_EXEMPT', 0], ['Second', 'ADVISORY_VAT', 1],
      ['Old 1', 'LITIGATION_EXEMPT', 2], ['Expense tie', 'DISBURSEMENT', 3], ['Last', 'LITIGATION_EXEMPT', 4],
    ]);
    expect(rows.map((l: any) => l.amount)).toEqual([50, 200, 200, 25, 10]);
    expect(mockPrisma.timeEntry.findMany.mock.calls[0][0].where.id.in).toEqual(['t2', 't1']);
  });

  it.each(['timeEntryLines', 'expenseLines'])('rejects foreign-case or unbillable ids in %s', async (field) => {
    await expect(billing.createInvoice(user, { caseId: 'case-1' }, {
      [field]: [{ id: 'foreign' }],
    })).rejects.toThrow(BadRequestException);
    const table = field === 'timeEntryLines' ? mockPrisma.timeEntry : mockPrisma.expense;
    expect(table.findMany.mock.calls[0][0].where).toMatchObject({
      caseId: 'case-1', case: { firmId: 'firm-1' }, invoiceId: null, writtenOffAt: null, billable: true,
    });
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it.each(['timeEntryLines', 'expenseLines'])('rejects linked %s without a case', async (field) => {
    await expect(billing.createInvoice(user, {}, { [field]: [{ id: 't1' }] })).rejects.toThrow('เก็บเงินจากบันทึกเวลา');
  });

  it('lets explicit empty linked lines override legacy ids', async () => {
    await billing.createInvoice(user, {}, { timeEntryLines: [], timeEntryIds: ['ignored'], expenseLines: [], expenseIds: ['ignored'] } as any);
    expect(mockPrisma.timeEntry.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('bills the single customer of the case for the full amount', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'viriyah', sharePercent: 100 },
    ]);

    const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, fee() as any);

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

    const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, fee() as any);

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

    const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, fee() as any);

    const total = invoices.reduce((sum: number, i: any) => sum + i.totalAmount, 0);
    expect(Math.round(total * 100) / 100).toBe(100000);
  });

  it('splits equally when nobody agreed on a share yet', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'a', sharePercent: null },
      { customerId: 'b', sharePercent: null },
    ]);

    const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, fee() as any);

    expect(invoices.map((i: any) => i.totalAmount)).toEqual([50000, 50000]);
  });

  it('honours an explicit split that overrides the shares on the case', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([
      { customerId: 'a', sharePercent: 50 },
      { customerId: 'b', sharePercent: 50 },
    ]);

    const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, {
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
      billing.createInvoice(user, { caseId: 'case-1' }, {
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

    await expect(billing.createInvoice(user, { caseId: 'case-1' }, fee() as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('still issues an invoice for a case that has no customer recorded', async () => {
    mockPrisma.caseCustomer.findMany.mockResolvedValue([]);

    const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, fee() as any);

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

      const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, {
        timeEntryIds: ['t1'],
        expenseIds: ['e1'],
      } as any);

      expect((invoices[0] as any).totalAmount).toBe(16200);
      expect((invoices[0] as any).lineItems.create).toEqual([
        { description: 'ว่าความนัดสืบพยาน', quantity: 6, unitPrice: 2500, amount: 15000, taxClass: 'LITIGATION_EXEMPT', sortOrder: 0 },
        { description: 'ค่าเดินทางไปศาล', quantity: 1, unitPrice: 1200, amount: 1200, taxClass: 'DISBURSEMENT', sortOrder: 1 },
      ]);
    });

    it('marks the billed work so it cannot be charged a second time', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความ', hours: 1, rate: 1000 },
      ]);

      await billing.createInvoice(user, { caseId: 'case-1' }, { timeEntryIds: ['t1'] } as any);

      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1'] }, invoiceId: null, caseId: 'case-1', case: { firmId: user.firmId }, billable: true, writtenOffAt: null },
        data: { invoiceId: 'invoice-INV-00001' },
      });
    });

    it('rejects when another request claims the same work during invoice creation', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([{ id: 't1', hours: 1, rate: 1000 }]);
      mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(billing.createInvoice(user, { caseId: 'case-1' }, { timeEntryIds: ['t1'] } as any)).rejects.toThrow(ConflictException);
    });

    it('links the split work to the primary payer invoice only, never twice', async () => {
      mockPrisma.caseCustomer.findMany.mockResolvedValue([
        { customerId: 'viriyah', sharePercent: 60 },
        { customerId: 'bangkok', sharePercent: 40 },
      ]);
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความ', hours: 1, rate: 1000 },
      ]);

      await billing.createInvoice(user, { caseId: 'case-1' }, { timeEntryIds: ['t1'] } as any);

      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.timeEntry.updateMany.mock.calls[0][0].data.invoiceId).toBe('invoice-INV-00001');
    });

    it('refuses work that another invoice already charged for', async () => {
      // ถูกออกบิลไปแล้ว จึงหลุดจาก where invoiceId: null
      mockPrisma.timeEntry.findMany.mockResolvedValue([]);

      await expect(
        billing.createInvoice(user, { caseId: 'case-1' }, { timeEntryIds: ['t1'] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    });

    it('refuses an expense the firm decided to absorb', async () => {
      // billable: false จึงหลุดจาก where ของ createInvoice
      mockPrisma.expense.findMany.mockResolvedValue([]);

      await expect(
        billing.createInvoice(user, { caseId: 'case-1' }, { expenseIds: ['e1'] } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    });

    it('only asks the database for expenses that are billable and unbilled', async () => {
      mockPrisma.expense.findMany.mockResolvedValue([
        { id: 'e1', description: 'ค่าเดินทาง', amount: 500 },
      ]);

      await billing.createInvoice(user, { caseId: 'case-1' }, { expenseIds: ['e1'] } as any);

      expect(mockPrisma.expense.findMany.mock.calls[0][0].where).toMatchObject({
        billable: true,
        invoiceId: null,
      });
    });

    it('refuses an invoice with nothing on it', async () => {
      await expect(billing.createInvoice(user, { caseId: 'case-1' }, {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('still accepts a hand-written line alongside the work from the case', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        { id: 't1', description: 'ว่าความ', hours: 1, rate: 1000 },
      ]);

      const invoices = await billing.createInvoice(user, { caseId: 'case-1' }, {
        timeEntryIds: ['t1'],
        lineItems: [{ description: 'ค่าธรรมเนียมศาล', quantity: 1, unitPrice: 500 }],
      } as any);

      expect((invoices[0] as any).totalAmount).toBe(1500);
    });
  });

  describe('ใบแจ้งหนี้ที่ไม่มีคดี', () => {
    it('bills the customers recorded on the intake', async () => {
      mockPrisma.intakeCustomer.findMany.mockResolvedValue([
        { customerId: 'viriyah', sharePercent: 100 },
      ]);

      const invoices = await billing.createInvoice(user, { intakeId: 'intake-1' }, fee() as any);

      expect(mockPrisma.caseCustomer.findMany).not.toHaveBeenCalled();
      expect((invoices[0] as any).intakeId).toBe('intake-1');
      expect((invoices[0] as any).caseId).toBeUndefined();
      expect((invoices[0] as any).billToCustomerId).toBe('viriyah');
    });

    it('refuses case work on an invoice raised off an intake, rather than dropping it', async () => {
      mockPrisma.intakeCustomer.findMany.mockResolvedValue([
        { customerId: 'viriyah', sharePercent: 100 },
      ]);

      await expect(
        billing.createInvoice(
          user,
          { intakeId: 'intake-1' },
          { ...fee(), timeEntryIds: ['t1'] } as any,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    });

    it('bills the named customer when nothing anchors the invoice', async () => {
      const invoices = await billing.createInvoice(user, {}, {
        ...fee(),
        billToCustomerId: 'viriyah',
      } as any);

      expect((invoices[0] as any).billToCustomerId).toBe('viriyah');
      expect((invoices[0] as any).firmId).toBe('firm-1');
    });

    it('accepts an empty invoice raised for the customer to look at first', async () => {
      const invoices = await billing.createInvoice(user, {}, { lineItems: [] } as any);

      expect(invoices).toHaveLength(1);
      expect((invoices[0] as any).totalAmount).toBe(0);
    });

    it('still refuses an empty invoice on a case, where the work should come from', async () => {
      mockPrisma.caseCustomer.findMany.mockResolvedValue([
        { customerId: 'viriyah', sharePercent: 100 },
      ]);

      await expect(
        billing.createInvoice(user, { caseId: 'case-1' }, { lineItems: [] } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  it('refuses to bill another firm\'s client', async () => {
    await expect(
      billing.createInvoice(user, {}, {
        billToCustomerId: 'other-firm-client', lineItems: [{ description: 'x', amount: 100 }],
      } as any),
    ).rejects.toThrow('ลูกความที่เลือกไม่อยู่ในสำนักงานนี้');
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });
});
