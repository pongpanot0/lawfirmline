import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthUser, ExpenseStatus, FirmRole } from '@lawfirm/shared';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.module';
import { PettyCashService } from './petty-cash.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';

/**
 * A cost drafted after a hearing is a note, not a claim. What matters is that
 * saving one commits no money, that it cannot skip the claim step on its way to
 * being approved (which is where petty cash is deducted), and that it can only
 * name a hearing on the case it is charged to.
 */
describe('BillingService — drafted expenses', () => {
  let service: BillingService;
  const mockPrisma = {
    expense: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    expenseClaim: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    calendarEvent: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    firmMember: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> => {
      if (typeof arg === 'function') {
        return (arg as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
      }
      return Promise.all(arg as unknown[]);
    }),
  } as any;
  const mockPettyCash = { deduct: jest.fn() };
  const mockLine = { isConfigured: jest.fn().mockReturnValue(false), pushTo: jest.fn() };
  const mockCaseAccess = {
    getCaseFilterForUser: jest.fn().mockReturnValue({}),
    getCaseFilterForFinancials: jest.fn().mockReturnValue({}),
    canAccessCase: jest.fn().mockResolvedValue(true),
  };
  const lawyer = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as AuthUser;
  const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PettyCashService, useValue: mockPettyCash },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
        { provide: LineMessagingService, useValue: mockLine },
      ],
    }).compile();
    service = module.get(BillingService);
  });

  it('saves a draft as a draft, so nothing is claimed by recording it', async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue({ id: 'event-1' });

    await service.createExpense(lawyer, 'case-1', {
      amount: 850.5,
      description: 'ค่าเดินทางไปศาล',
      sourceEventId: 'event-1',
      status: ExpenseStatus.DRAFT,
    } as never);

    expect(mockPrisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ExpenseStatus.DRAFT,
          sourceEventId: 'event-1',
          amount: 850.5,
        }),
      }),
    );
  });

  it('still claims by default, so existing callers are unchanged', async () => {
    await service.createExpense(lawyer, 'case-1', {
      amount: 100,
      description: 'ค่าถ่ายเอกสาร',
    } as never);

    expect(mockPrisma.expense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ExpenseStatus.PENDING, sourceEventId: null }),
      }),
    );
  });

  it('refuses a hearing that belongs to another case', async () => {
    mockPrisma.calendarEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.createExpense(lawyer, 'case-1', {
        amount: 100,
        description: 'ค่าเดินทาง',
        sourceEventId: 'event-of-another-case',
      } as never),
    ).rejects.toThrow(NotFoundException);
    expect(mockPrisma.expense.create).not.toHaveBeenCalled();
  });

  it('refuses to approve a draft, which would skip the petty cash deduction', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      amount: 500,
      status: ExpenseStatus.DRAFT,
    });

    await expect(
      service.updateExpenseStatus(owner, 'expense-1', { status: ExpenseStatus.APPROVED }),
    ).rejects.toThrow(BadRequestException);
    expect(mockPettyCash.deduct).not.toHaveBeenCalled();
    expect(mockPrisma.expense.update).not.toHaveBeenCalled();
  });

  it('lets the author claim their own draft without being the owner', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      amount: 500,
      status: ExpenseStatus.DRAFT,
      claimId: null,
    });
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: 'expense-1', userId: 'user-1', amount: 500, status: ExpenseStatus.DRAFT, claimId: null },
    ]);
    mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim-1' });
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.expenseClaim.findUniqueOrThrow.mockResolvedValue({
      id: 'claim-1',
      status: 'PENDING',
      submittedAt: new Date(),
      reviewedAt: null,
      paidAt: null,
      submittedBy: { id: 'user-1', firstName: 'Somchai', lastName: 'Lawyer' },
      expenses: [
        {
          id: 'expense-1',
          amount: 500,
          receiptFilename: null,
          case: null,
          user: { id: 'user-1', firstName: 'Somchai', lastName: 'Lawyer' },
        },
      ],
    });

    const result = await service.updateExpenseStatus(lawyer, 'expense-1', {
      status: ExpenseStatus.PENDING,
    });

    expect(result.id).toBe('expense-1');
    expect(mockPrisma.expenseClaim.create).toHaveBeenCalled();
    expect(mockPrisma.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ExpenseStatus.PENDING, claimId: 'claim-1' }),
      }),
    );
    expect(mockPettyCash.deduct).not.toHaveBeenCalled();
  });

  it('does not let one lawyer claim a draft that is not theirs', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'expense-1',
      userId: 'someone-else',
      amount: 500,
      status: ExpenseStatus.DRAFT,
    });

    await expect(
      service.updateExpenseStatus(lawyer, 'expense-1', { status: ExpenseStatus.PENDING }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('submits multiple drafts as one claim round and notifies owners', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([
      { id: 'expense-1', userId: 'user-1', amount: 300, status: ExpenseStatus.DRAFT, claimId: null, description: 'ค่าเดินทาง' },
      { id: 'expense-2', userId: 'user-1', amount: 200, status: ExpenseStatus.DRAFT, claimId: null, description: 'ค่าถ่ายเอกสาร' },
    ]);
    mockPrisma.expenseClaim.create.mockResolvedValue({ id: 'claim-1' });
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.expenseClaim.findUniqueOrThrow.mockResolvedValue({
      id: 'claim-1',
      status: 'PENDING',
      submittedAt: new Date(),
      reviewedAt: null,
      paidAt: null,
      submittedBy: { id: 'user-1', firstName: 'Somchai', lastName: 'Lawyer' },
      expenses: [
        { id: 'expense-1', amount: 300, receiptFilename: null, case: null, description: 'ค่าเดินทาง', user: { id: 'user-1', firstName: 'Somchai', lastName: 'Lawyer' } },
        { id: 'expense-2', amount: 200, receiptFilename: 'r.pdf', case: { id: 'c1', ownRef: 'A-1', title: 'Case' }, description: 'ค่าถ่ายเอกสาร', user: { id: 'user-1', firstName: 'Somchai', lastName: 'Lawyer' } },
      ],
    });
    mockPrisma.firmMember.findMany.mockResolvedValue([
      { user: { lineUserId: 'U-owner', firstName: 'Owner', lastName: 'One' } },
    ]);
    mockLine.isConfigured.mockReturnValue(true);

    const result = await service.submitExpensesForApproval(lawyer, ['expense-1', 'expense-2']);

    expect(result.id).toBe('claim-1');
    expect(result.itemCount).toBe(2);
    expect(result.totalAmount).toBe(500);
    expect(result.receiptCount).toBe(1);
    expect(mockLine.pushTo).toHaveBeenCalledWith('U-owner', expect.stringContaining('2 รายการ'));
  });

  it('approves a whole claim round and deducts petty cash once', async () => {
    mockPrisma.expenseClaim.findFirst.mockResolvedValue({
      id: 'claim-1',
      status: 'PENDING',
      expenses: [
        { id: 'expense-1', amount: 300 },
        { id: 'expense-2', amount: 200 },
      ],
    });
    mockPrisma.expense.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.expenseClaim.update.mockResolvedValue({
      id: 'claim-1',
      status: 'APPROVED',
      submittedAt: new Date(),
      reviewedAt: new Date(),
      paidAt: null,
      submittedBy: { id: 'user-1', firstName: 'Somchai', lastName: 'Lawyer' },
      expenses: [
        { id: 'expense-1', amount: 300, receiptFilename: null, case: null },
        { id: 'expense-2', amount: 200, receiptFilename: null, case: null },
      ],
    });

    const result = await service.updateExpenseClaimStatus(owner, 'claim-1', {
      status: 'APPROVED' as never,
    });

    expect(mockPettyCash.deduct).toHaveBeenCalledWith('firm-1', 500);
    expect(result.status).toBe('APPROVED');
  });

  it('keeps approval to the owner and still deducts petty cash on a real claim', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      amount: 500,
      status: ExpenseStatus.PENDING,
      claimId: null,
    });
    mockPrisma.expense.update.mockResolvedValue({ id: 'expense-1' });

    await expect(
      service.updateExpenseStatus(lawyer, 'expense-1', { status: ExpenseStatus.APPROVED }),
    ).rejects.toThrow(ForbiddenException);

    await service.updateExpenseStatus(owner, 'expense-1', { status: ExpenseStatus.APPROVED });
    expect(mockPettyCash.deduct).toHaveBeenCalledWith('firm-1', 500);
  });

  it('blocks per-line approval when the expense belongs to a claim round', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      amount: 500,
      status: ExpenseStatus.PENDING,
      claimId: 'claim-1',
    });

    await expect(
      service.updateExpenseStatus(owner, 'expense-1', { status: ExpenseStatus.APPROVED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('hides other lawyers’ drafts from the owner until they are submitted', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);

    await service.getAllExpenses(owner);

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"not":"DRAFT"');
    expect(JSON.stringify(where)).toContain(`"userId":"${owner.id}"`);
  });

  it('lets a lawyer list their own drafts and claims only', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);

    await service.getAllExpenses(lawyer, { status: ExpenseStatus.DRAFT });

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(`"userId":"${lawyer.id}"`);
    expect(where.AND).toEqual(
      expect.arrayContaining([{ status: ExpenseStatus.DRAFT }]),
    );
  });

  it('lets the owner filter submitted claims by requester', async () => {
    mockPrisma.expense.findMany.mockResolvedValue([]);

    await service.getAllExpenses(owner, {
      status: ExpenseStatus.PENDING,
      userId: 'lawyer-9',
    });

    const where = mockPrisma.expense.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { status: ExpenseStatus.PENDING },
        { userId: 'lawyer-9' },
      ]),
    );
  });
});
