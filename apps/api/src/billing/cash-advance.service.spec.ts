import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CashAdvanceService } from './cash-advance.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PrismaService } from '../prisma/prisma.module';

describe('CashAdvanceService', () => {
  let service: CashAdvanceService;
  const mockPrisma = {
    firmMember: { findFirst: jest.fn() },
    cashAdvance: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    expense: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const tx = {
    cashAdvance: { findFirst: jest.fn(), findFirstOrThrow: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  } as any;
  const advance = { id: 'adv-1', firmId: 'firm-1', userId: 'user-1', amount: 1000, remaining: 500, returnedAmount: 100, settledAt: null };
  const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;
  const lawyer = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as AuthUser;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPrisma.$transaction.mockImplementation(async (callback) => callback(tx));
    tx.cashAdvance.findFirst.mockResolvedValue({ ...advance });
    tx.cashAdvance.updateMany.mockResolvedValue({ count: 1 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [CashAdvanceService, { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } }, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CashAdvanceService);
  });

  describe('issue', () => {
    it('only the owner can issue an advance', async () => {
      await expect(service.issue(lawyer, { userId: 'user-2', amount: 1000 })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.cashAdvance.create).not.toHaveBeenCalled();
    });

    it('an office manager cannot issue an advance (money out stays owner)', async () => {
      const officeManager = { id: 'om-1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as AuthUser;
      await expect(service.issue(officeManager, { userId: 'user-2', amount: 1000 })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.cashAdvance.create).not.toHaveBeenCalled();
    });

    it('rejects a recipient outside the firm', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue(null);
      await expect(service.issue(owner, { userId: 'outsider', amount: 1000 })).rejects.toThrow(NotFoundException);
    });

    it('starts remaining equal to the issued amount', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue({ id: 'member-1' });
      await service.issue(owner, { userId: 'user-1', amount: 1500, note: 'ค่าใช้จ่ายศาลต่างจังหวัด' });
      expect(mockPrisma.cashAdvance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 1500, remaining: 1500, issuedById: 'owner-1' }),
        }),
      );
    });
  });

  describe('list', () => {
    it('lets a non-owner see only their own advances', async () => {
      await expect(service.list(lawyer, 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('scopes a non-owner query to themselves when no userId is given', async () => {
      mockPrisma.cashAdvance.findMany.mockResolvedValue([]);
      await service.list(lawyer);
      expect(mockPrisma.cashAdvance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });

  describe('consume', () => {
    it('rejects an advance that does not belong to this firm/user', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue(null);
      await expect(service.consume(tx, 'firm-1', 'user-1', 'adv-1', 100)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the amount exceeds what remains', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ id: 'adv-1', remaining: 50 });
      await expect(service.consume(tx, 'firm-1', 'user-1', 'adv-1', 100)).rejects.toThrow(BadRequestException);
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it('decrements remaining by the consumed amount', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ id: 'adv-1', remaining: 500 });
      await service.consume(tx, 'firm-1', 'user-1', 'adv-1', 200);
      expect(tx.cashAdvance.updateMany).toHaveBeenCalledWith({
        where: { id: 'adv-1', firmId: 'firm-1', userId: 'user-1', settledAt: null, remaining: { gte: 200, equals: 500 } },
        data: { remaining: 300 },
      });
    });

    it('rejects a settled advance even if its stored balance is positive', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ ...advance, settledAt: new Date() });
      await expect(service.consume(tx, 'firm-1', 'user-1', 'adv-1', 100)).rejects.toThrow(ConflictException);
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when a concurrent return or settlement wins the conditional update', async () => {
      tx.cashAdvance.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.consume(tx, 'firm-1', 'user-1', 'adv-1', 100)).rejects.toThrow(ConflictException);
    });
  });

  describe('recordReturn', () => {
    it('rejects a return above the remaining balance', async () => {
      await expect(service.recordReturn(owner, 'adv-1', 501)).rejects.toThrow(BadRequestException);
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it.each([0, -1, NaN, Infinity])('rejects an invalid return amount %s', async (amount) => {
      await expect(service.recordReturn(owner, 'adv-1', amount)).rejects.toThrow(BadRequestException);
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it('atomically reduces remaining, adds returnedAmount and audits within the transaction', async () => {
      const updated = { ...advance, remaining: 300, returnedAmount: 300 };
      tx.cashAdvance.findFirstOrThrow.mockResolvedValue(updated);
      await expect(service.recordReturn(owner, 'adv-1', 200, 'รับเงินคืนแล้ว')).resolves.toEqual(updated);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.cashAdvance.findFirst).toHaveBeenCalledWith({ where: { id: 'adv-1', firmId: 'firm-1' } });
      expect(tx.cashAdvance.updateMany).toHaveBeenCalledWith({
        where: { id: 'adv-1', firmId: 'firm-1', settledAt: null, remaining: { gte: 200, equals: 500 } },
        data: { remaining: 300, returnedAmount: 300 },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({ data: {
        firmId: 'firm-1', userId: 'owner-1', action: 'CASH_ADVANCE_RETURNED',
        metadata: { advanceId: 'adv-1', amount: 200, note: 'รับเงินคืนแล้ว' },
      } });
      expect(tx.cashAdvance.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 'adv-1', firmId: 'firm-1' } });
    });
  });

  describe('settle', () => {
    it('rejects settlement while money remains', async () => {
      await expect(service.settle(owner, 'adv-1')).rejects.toThrow(ConflictException);
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it('sets the settler, time and note and audits within the transaction', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ ...advance, remaining: 0 });
      tx.cashAdvance.findFirstOrThrow.mockResolvedValue({ ...advance, remaining: 0, settledAt: new Date(), settledById: owner.id });
      await service.settle(owner, 'adv-1', 'ครบแล้ว');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.cashAdvance.updateMany).toHaveBeenCalledWith({
        where: { id: 'adv-1', firmId: 'firm-1', settledAt: null, remaining: 0 },
        data: { settledAt: expect.any(Date), settledById: 'owner-1', settlementNote: 'ครบแล้ว' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({ data: {
        firmId: 'firm-1', userId: 'owner-1', action: 'CASH_ADVANCE_SETTLED',
        metadata: { advanceId: 'adv-1', note: 'ครบแล้ว' },
      } });
      expect(tx.cashAdvance.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 'adv-1', firmId: 'firm-1' } });
    });
  });

  it.each(['consume', 'return'] as const)('can settle fractional money after %s followed by the other operation', async (first) => {
    const balance = { ...advance, amount: 0.3, remaining: 0.3, returnedAmount: 0, settledAt: null as Date | null };
    tx.cashAdvance.findFirst.mockImplementation(async () => ({ ...balance }));
    tx.cashAdvance.findFirstOrThrow.mockImplementation(async () => ({ ...balance }));
    tx.cashAdvance.updateMany.mockImplementation(async ({ where, data }: any) => {
      if (balance.settledAt || (typeof where.remaining === 'number' && balance.remaining !== where.remaining)
        || balance.remaining < (where.remaining?.gte ?? 0)
        || (where.remaining?.equals !== undefined && balance.remaining !== where.remaining.equals)) return { count: 0 };
      if (data.remaining !== undefined) balance.remaining = typeof data.remaining === 'number'
        ? data.remaining : balance.remaining - data.remaining.decrement;
      if (data.returnedAmount !== undefined) balance.returnedAmount = typeof data.returnedAmount === 'number'
        ? data.returnedAmount : balance.returnedAmount + data.returnedAmount.increment;
      if (data.settledAt) balance.settledAt = data.settledAt;
      return { count: 1 };
    });

    if (first === 'consume') {
      await service.consume(tx, 'firm-1', 'user-1', 'adv-1', 0.1);
      await service.recordReturn(owner, 'adv-1', 0.2);
    } else {
      await service.recordReturn(owner, 'adv-1', 0.1);
      await service.consume(tx, 'firm-1', 'user-1', 'adv-1', 0.2);
    }
    await service.settle(owner, 'adv-1');
    expect(balance.remaining).toBe(0);
    expect(balance.returnedAmount).toBe(first === 'consume' ? 0.2 : 0.1);
    expect(balance.settledAt).toBeInstanceOf(Date);
  });

  describe.each(['recordReturn', 'settle'] as const)('%s tenant and concurrency checks', (method) => {
    const invoke = (id: string) => method === 'recordReturn'
      ? service.recordReturn(owner, id, 100)
      : service.settle(owner, id);

    it('does not find an advance outside the firm', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue(null);
      await expect(invoke('outside-firm')).rejects.toThrow(NotFoundException);
      expect(tx.cashAdvance.findFirst).toHaveBeenCalledWith({ where: { id: 'outside-firm', firmId: 'firm-1' } });
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an already settled advance', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ ...advance, remaining: 0, settledAt: new Date() });
      await expect(invoke('adv-1')).rejects.toThrow(ConflictException);
      expect(tx.cashAdvance.updateMany).not.toHaveBeenCalled();
    });

    it('does not audit when the conditional update loses a race', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ ...advance, remaining: method === 'settle' ? 0 : 500 });
      tx.cashAdvance.updateMany.mockResolvedValue({ count: 0 });
      await expect(invoke('adv-1')).rejects.toThrow(ConflictException);
      expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
  });

  it.each([
    ['recordReturn', () => service.recordReturn(lawyer, 'adv-1', 100)],
    ['settle', () => service.settle(lawyer, 'adv-1')],
    ['reconciliation', () => service.reconciliation(lawyer, {})],
    ['listExpenses', () => service.listExpenses(lawyer, 'adv-1')],
  ] as const)('requires issueCashAdvance capability for %s', async (_method, invoke) => {
    await expect(invoke()).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.cashAdvance.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('only offers the current staff member their own open advances with a balance', async () => {
    await service.listMineWithBalance(lawyer);
    expect(mockPrisma.cashAdvance.findMany).toHaveBeenCalledWith({
      where: { firmId: 'firm-1', userId: 'user-1', settledAt: null, remaining: { gt: 0 } },
      orderBy: { issuedAt: 'desc' },
    });
  });

  describe('reconciliation', () => {
    it('calculates spent excluding returns and counts each type of missing receipt', async () => {
      const user = { id: 'user-1', firstName: 'สมชาย', lastName: 'ใจดี' };
      const issuedAt = new Date();
      mockPrisma.cashAdvance.findMany.mockResolvedValue([{ ...advance, user, issuedAt, expenses: [
        { category: 'ค่าธรรมเนียมศาล', receiptFilename: null, officialReceiptNo: null },
        { category: 'ค่าธรรมเนียมศาล', receiptFilename: 'receipt.pdf', officialReceiptNo: '' },
        { category: 'ค่าธรรมเนียมศาล', receiptFilename: null, officialReceiptNo: 'ศาล-123' },
        { category: 'ค่าเดินทาง', receiptFilename: 'trip.jpg', officialReceiptNo: null },
      ] }]);
      await expect(service.reconciliation(owner, {})).resolves.toEqual([{
        id: 'adv-1', user, issuedAt, amount: 1000, spent: 400, returnedAmount: 100,
        remaining: 500, missingReceiptFiles: 2, courtFeesMissingReceiptNo: 2, settledAt: null,
      }]);
      expect(mockPrisma.cashAdvance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ firmId: 'firm-1' }),
        include: expect.objectContaining({ expenses: expect.objectContaining({
          where: { paidFromAdvance: { firmId: 'firm-1' } },
        }) }),
      }));
    });

    it.each(['open', 'settled'] as const)('filters %s advances within the firm', async (status) => {
      mockPrisma.cashAdvance.findMany.mockResolvedValue([]);
      await service.reconciliation(owner, { status });
      expect(mockPrisma.cashAdvance.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { firmId: 'firm-1', settledAt: status === 'open' ? null : { not: null } },
      }));
    });
  });

  describe('listExpenses', () => {
    it('does not expose expenses of another firm\'s advance', async () => {
      mockPrisma.cashAdvance.findFirst.mockResolvedValue(null);
      await expect(service.listExpenses(owner, 'outside-firm')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.cashAdvance.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'outside-firm', firmId: 'firm-1' },
      }));
      expect(mockPrisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('returns the receipt details for expenses linked to this firm\'s advance', async () => {
      mockPrisma.cashAdvance.findFirst.mockResolvedValue(advance);
      mockPrisma.expense.findMany.mockResolvedValue([{ id: 'expense-1' }]);
      await expect(service.listExpenses(owner, 'adv-1')).resolves.toEqual([{ id: 'expense-1' }]);
      expect(mockPrisma.expense.findMany).toHaveBeenCalledWith({
        where: { paidFromAdvanceId: 'adv-1', paidFromAdvance: { firmId: 'firm-1' } },
        select: { id: true, date: true, description: true, category: true, amount: true,
          receiptFilename: true, officialReceiptNo: true, caseId: true },
        orderBy: { date: 'desc' },
      });
    });
  });
});
