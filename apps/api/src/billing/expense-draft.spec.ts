import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, ExpenseStatus, FirmRole } from '@lawfirm/shared';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.module';
import { PettyCashService } from './petty-cash.service';
import { CaseAccessService } from '../common/services/case-access.service';

/**
 * A cost drafted after a hearing is a note, not a claim. What matters is that
 * saving one commits no money, that it cannot skip the claim step on its way to
 * being approved (which is where petty cash is deducted), and that it can only
 * name a hearing on the case it is charged to.
 */
describe('BillingService — drafted expenses', () => {
  let service: BillingService;
  const mockPrisma = {
    expense: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    calendarEvent: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
  };
  const mockPettyCash = { deduct: jest.fn() };
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
    });
    mockPrisma.expense.update.mockResolvedValue({ id: 'expense-1' });

    await service.updateExpenseStatus(lawyer, 'expense-1', { status: ExpenseStatus.PENDING });

    expect(mockPrisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ExpenseStatus.PENDING } }),
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

  it('keeps approval to the owner and still deducts petty cash on a real claim', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'expense-1',
      userId: 'user-1',
      amount: 500,
      status: ExpenseStatus.PENDING,
    });
    mockPrisma.expense.update.mockResolvedValue({ id: 'expense-1' });

    await expect(
      service.updateExpenseStatus(lawyer, 'expense-1', { status: ExpenseStatus.APPROVED }),
    ).rejects.toThrow(ForbiddenException);

    await service.updateExpenseStatus(owner, 'expense-1', { status: ExpenseStatus.APPROVED });
    expect(mockPettyCash.deduct).toHaveBeenCalledWith('firm-1', 500);
  });
});
