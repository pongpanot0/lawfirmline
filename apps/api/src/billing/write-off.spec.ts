import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { BillingService } from './billing.service';
import { CollectionsService } from './collections.service';
import { OperationsService } from '../operations/operations.service';
import { unbilledExpenseWhere, unbilledTimeWhere } from './unbilled';

const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;

describe('unbilled filters', () => {
  it('exclude invoiced, non-billable and written-off rows', () => {
    expect(unbilledTimeWhere()).toEqual({ billable: true, invoiceId: null, writtenOffAt: null });
    expect(unbilledExpenseWhere()).toEqual({
      billable: true,
      invoiceId: null,
      writtenOffAt: null,
      status: { in: ['APPROVED', 'PAID'] },
    });
  });
});

describe('BillingService — WIP write-off, discount, split groups', () => {
  const mockPrisma = {
    timeEntry: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    expense: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    invoice: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    case: { findUnique: jest.fn() },
    caseCustomer: { findMany: jest.fn() },
    intakeCustomer: { findMany: jest.fn() },
    client: { count: jest.fn(async ({ where }: any) => where.id.in.length) },
    auditLog: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg))),
  } as any;
  let billing: BillingService;
  let nextNumber: number;

  beforeEach(() => {
    jest.clearAllMocks();
    nextNumber = 1;
    billing = new BillingService(mockPrisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    mockPrisma.$queryRaw.mockImplementation(async (_s: unknown, howMany: number) =>
      Array.from({ length: howMany }, () => ({ n: BigInt(nextNumber++) })),
    );
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: `inv-${data.invoiceNumber}`, ...data }));
    mockPrisma.timeEntry.findMany.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([]);
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.caseCustomer.findMany.mockResolvedValue([]);
    mockPrisma.intakeCustomer.findMany.mockResolvedValue([]);
  });

  describe('time entry write-off', () => {
    const entry = { id: 'te-1', invoiceId: null, writtenOffAt: null, hours: 2, rate: 1000 };

    it('writes off an unbilled entry with reason and audit', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(entry);
      await billing.writeOffTimeEntry(user, 'case-1', 'te-1', '  ลูกความไม่ได้ตกลงค่าชั่วโมงนี้  ');

      expect(mockPrisma.timeEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'te-1', caseId: 'case-1', case: { firmId: 'firm-1' } } }),
      );
      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'te-1', invoiceId: null, writtenOffAt: null },
        data: { writtenOffAt: expect.any(Date), writtenOffById: 'user-1', writeOffReason: 'ลูกความไม่ได้ตกลงค่าชั่วโมงนี้' },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmId: 'firm-1', userId: 'user-1', action: 'TIME_ENTRY_WRITTEN_OFF' }),
      });
    });

    it('rejects write-off of an invoiced entry', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ ...entry, invoiceId: 'inv-1' });
      await expect(billing.writeOffTimeEntry(user, 'case-1', 'te-1', 'เหตุผลที่ยาวพอ')).rejects.toThrow(ConflictException);
      expect(mockPrisma.timeEntry.updateMany).not.toHaveBeenCalled();
    });

    it('rejects reason shorter than 5 chars', async () => {
      await expect(billing.writeOffTimeEntry(user, 'case-1', 'te-1', ' abcd ')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.timeEntry.findFirst).not.toHaveBeenCalled();
    });

    it('404s for an entry outside the firm', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(null);
      await expect(billing.writeOffTimeEntry(user, 'case-1', 'te-9', 'เหตุผลที่ยาวพอ')).rejects.toThrow(NotFoundException);
    });

    it('conflicts when the claim race was lost', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(entry);
      mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(billing.writeOffTimeEntry(user, 'case-1', 'te-1', 'เหตุผลที่ยาวพอ')).rejects.toThrow(ConflictException);
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('undo clears the 3 fields only while unbilled', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: 'te-1' });
      await billing.undoTimeEntryWriteOff(user, 'case-1', 'te-1');
      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'te-1', invoiceId: null, writtenOffAt: { not: null } },
        data: { writtenOffAt: null, writtenOffById: null, writeOffReason: null },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'TIME_ENTRY_WRITE_OFF_UNDONE' }),
      });

      mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(billing.undoTimeEntryWriteOff(user, 'case-1', 'te-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('expense write-off', () => {
    const expense = { id: 'ex-1', caseId: 'case-1', invoiceId: null, writtenOffAt: null, amount: 300 };

    it('writes off scoped by the firm expense filter, with audit', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue(expense);
      await billing.writeOffExpense(user, 'ex-1', 'ค่าถ่ายเอกสารเล็กน้อย');
      const where = mockPrisma.expense.findFirst.mock.calls[0][0].where;
      expect(where.id).toBe('ex-1');
      expect(JSON.stringify(where.OR)).toContain('firm-1');
      expect(mockPrisma.expense.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ex-1', invoiceId: null, writtenOffAt: null } }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'EXPENSE_WRITTEN_OFF' }),
      });
    });

    it('rejects invoiced expense and short reason; undo works', async () => {
      mockPrisma.expense.findFirst.mockResolvedValue({ ...expense, invoiceId: 'inv-1' });
      await expect(billing.writeOffExpense(user, 'ex-1', 'ค่าถ่ายเอกสารเล็กน้อย')).rejects.toThrow(ConflictException);
      await expect(billing.writeOffExpense(user, 'ex-1', 'abc')).rejects.toThrow(BadRequestException);

      mockPrisma.expense.findFirst.mockResolvedValue({ id: 'ex-1', caseId: 'case-1' });
      await billing.undoExpenseWriteOff(user, 'ex-1');
      expect(mockPrisma.expense.updateMany).toHaveBeenCalledWith({
        where: { id: 'ex-1', invoiceId: null, writtenOffAt: { not: null } },
        data: { writtenOffAt: null, writtenOffById: null, writeOffReason: null },
      });
    });
  });

  it('getInvoiceDraft excludes written-off time and expenses', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({ estimatedFee: null, actualFee: null });
    await billing.getInvoiceDraft('case-1');
    expect(mockPrisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({ caseId: 'case-1', ...unbilledTimeWhere() });
    expect(mockPrisma.expense.findMany.mock.calls[0][0].where).toEqual({ caseId: 'case-1', ...unbilledExpenseWhere() });
  });

  describe('createInvoice', () => {
    const fee = (amount = 1000) => ({ lineItems: [{ description: 'ค่าดำเนินคดี', quantity: 1, unitPrice: amount }] });
    const two = [{ customerId: 'c1', sharePercent: 50 }, { customerId: 'c2', sharePercent: 50 }];

    it('claim updateMany filters writtenOffAt: null (race with write-off)', async () => {
      mockPrisma.timeEntry.findMany.mockResolvedValue([{ id: 'te-1', hours: 1, rate: 500, description: 'x' }]);
      mockPrisma.expense.findMany.mockResolvedValue([{ id: 'ex-1', amount: 100, description: 'y' }]);
      await billing.createInvoice(user, { caseId: 'case-1' }, { timeEntryIds: ['te-1'], expenseIds: ['ex-1'] } as any);

      expect(mockPrisma.timeEntry.findMany.mock.calls[0][0].where).toMatchObject({ writtenOffAt: null });
      expect(mockPrisma.expense.findMany.mock.calls[0][0].where).toMatchObject({ writtenOffAt: null });
      expect(mockPrisma.timeEntry.updateMany.mock.calls[0][0].where).toMatchObject({ writtenOffAt: null, invoiceId: null });
      expect(mockPrisma.expense.updateMany.mock.calls[0][0].where).toMatchObject({ writtenOffAt: null, invoiceId: null });
    });

    it('split invoices share one splitGroupId; single invoice gets none', async () => {
      mockPrisma.caseCustomer.findMany.mockResolvedValue([{ customerId: 'c1', sharePercent: 50 }, { customerId: 'c2', sharePercent: 50 }]);
      const split = await billing.createInvoice(user, { caseId: 'case-1' }, { ...fee(), splits: two } as any);
      expect(split).toHaveLength(2);
      const ids = mockPrisma.invoice.create.mock.calls.map((c: any) => c[0].data.splitGroupId);
      expect(ids[0]).toEqual(expect.any(String));
      expect(ids[1]).toBe(ids[0]);

      mockPrisma.invoice.create.mockClear();
      mockPrisma.caseCustomer.findMany.mockResolvedValue([{ customerId: 'c1', sharePercent: 100 }]);
      await billing.createInvoice(user, { caseId: 'case-1' }, fee() as any);
      expect(mockPrisma.invoice.create.mock.calls[0][0].data.splitGroupId).toBeNull();
    });

    it('totalAmount = lines - discountAmount', async () => {
      await billing.createInvoice(user, { caseId: 'case-1' }, { ...fee(1000), discountAmount: 150.5, discountReason: 'ลูกค้าประจำ' } as any);
      const data = mockPrisma.invoice.create.mock.calls[0][0].data;
      expect(data.totalAmount).toBe(849.5);
      expect(data.discountAmount).toBe(150.5);
      expect(data.discountReason).toBe('ลูกค้าประจำ');
    });

    it('rejects discount > subtotal, missing reason, and discount on split bills', async () => {
      mockPrisma.caseCustomer.findMany.mockResolvedValue([{ customerId: 'c1', sharePercent: 50 }, { customerId: 'c2', sharePercent: 50 }]);
      await expect(
        billing.createInvoice(user, { caseId: 'case-1' }, { ...fee(1000), discountAmount: 1000.01, discountReason: 'เกินยอด' } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        billing.createInvoice(user, { caseId: 'case-1' }, { ...fee(1000), discountAmount: 100 } as any),
      ).rejects.toThrow(BadRequestException);
      await expect(
        billing.createInvoice(user, { caseId: 'case-1' }, { ...fee(1000), splits: two, discountAmount: 100, discountReason: 'ลด' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('setInvoiceDiscount', () => {
    const draft = (extra: object = {}) => ({
      id: 'inv-1', firmId: 'firm-1', status: 'DRAFT', discountAmount: 0,
      lineItems: [{ amount: 600 }, { amount: 400 }], ...extra,
    });

    it('recomputes totalAmount on a DRAFT, with audit', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(draft());
      mockPrisma.invoice.updateMany.mockResolvedValue({ count: 1 });
      await billing.setInvoiceDiscount(user, 'inv-1', { discountAmount: 100, discountReason: 'ต่อรอง' });
      expect(mockPrisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', firmId: 'firm-1', status: 'DRAFT' },
        data: { discountAmount: 100, discountReason: 'ต่อรอง', totalAmount: 900 },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'INVOICE_DISCOUNT_SET' }),
      });
    });

    it('only on DRAFT', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(draft({ status: 'SENT' }));
      await expect(
        billing.setInvoiceDiscount(user, 'inv-1', { discountAmount: 100, discountReason: 'ต่อรอง' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.invoice.updateMany).not.toHaveBeenCalled();
    });

    it('rejects discount over subtotal or without reason', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(draft());
      await expect(billing.setInvoiceDiscount(user, 'inv-1', { discountAmount: 1001, discountReason: 'x' })).rejects.toThrow(BadRequestException);
      await expect(billing.setInvoiceDiscount(user, 'inv-1', { discountAmount: 10 })).rejects.toThrow(BadRequestException);
    });
  });
});

describe('unbilled totals ignore written-off rows', () => {
  it('getOwnerKpis queries with the shared filters', async () => {
    const prisma = {
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      invoicePayment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
      case: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      firm: { findUniqueOrThrow: jest.fn().mockResolvedValue({ slaConfig: null }) },
    } as any;
    await new OperationsService(prisma).getOwnerKpis(user, '2026-09');
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({ ...unbilledTimeWhere(), case: { firmId: 'firm-1', deletedAt: null } });
    expect(prisma.expense.findMany.mock.calls[0][0].where).toEqual({ ...unbilledExpenseWhere(), case: { firmId: 'firm-1', deletedAt: null } });
  });

  it('ownerWorklist queries with the shared filters', async () => {
    const prisma = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      invoicePayment: { findMany: jest.fn().mockResolvedValue([]) },
      timeEntry: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    } as any;
    await new CollectionsService(prisma, {} as any, {} as any).ownerWorklist(user, '2026-09');
    expect(prisma.timeEntry.findMany.mock.calls[0][0].where).toEqual({ ...unbilledTimeWhere(), case: { firmId: 'firm-1', deletedAt: null } });
    expect(prisma.expense.findMany.mock.calls[0][0].where).toEqual({ ...unbilledExpenseWhere(), case: { firmId: 'firm-1', deletedAt: null } });
  });
});
