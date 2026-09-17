import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthUser, ExpenseClaimStatus, ExpenseStatus, FirmRole } from '@lawfirm/shared';
import { BillingService } from './billing.service';
import { PettyCashService } from './petty-cash.service';
import { CashAdvanceService } from './cash-advance.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;

describe('Billing LINE notifications', () => {
  const mockPrisma = {
    expense: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    expenseClaim: { findFirst: jest.fn(), update: jest.fn() },
    firmMember: { findFirst: jest.fn(), findMany: jest.fn() },
    cashAdvance: { create: jest.fn() },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg))),
  } as any;
  const mockNotifier = { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() };
  let billing: BillingService;
  let advances: CashAdvanceService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        CashAdvanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PettyCashService, useValue: { deduct: jest.fn() } },
        { provide: CaseAccessService, useValue: { getCaseFilterForUser: jest.fn().mockReturnValue({}) } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: LineMessagingService, useValue: { isConfigured: jest.fn().mockReturnValue(false), pushTo: jest.fn() } },
        { provide: FileStorageService, useValue: {} },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    billing = module.get(BillingService);
    advances = module.get(CashAdvanceService);
  });

  it('notifies the requester when a single expense is approved', async () => {
    mockPrisma.expense.findFirst.mockResolvedValue({
      id: 'e1', userId: 'u2', amount: 1500, status: ExpenseStatus.PENDING, claimId: null,
    });
    mockPrisma.expense.update.mockResolvedValue({ id: 'e1', userId: 'u2', amount: 1500 });
    await billing.updateExpenseStatus(owner, 'e1', { status: ExpenseStatus.APPROVED } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u2'],
      actorUserId: 'owner-1',
      summaryText: expect.stringContaining('อนุมัติ'),
      entityPath: '/expenses',
    });
  });

  it('notifies the submitter when a claim is paid', async () => {
    mockPrisma.expenseClaim.findFirst.mockResolvedValue({
      id: 'cl1',
      status: ExpenseClaimStatus.APPROVED,
      submittedById: 'u2',
      expenses: [{ id: 'e1', amount: 700, receiptFilename: null, case: null }],
    });
    mockPrisma.expenseClaim.update.mockResolvedValue({
      id: 'cl1',
      status: ExpenseClaimStatus.PAID,
      submittedAt: new Date(),
      reviewedAt: null,
      paidAt: new Date(),
      submittedBy: { id: 'u2', firstName: 'A', lastName: 'B' },
      expenses: [{ id: 'e1', amount: 700, receiptFilename: null, case: null }],
    });
    await billing.updateExpenseClaimStatus(owner, 'cl1', { status: ExpenseClaimStatus.PAID } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u2'],
      actorUserId: 'owner-1',
      summaryText: expect.stringContaining('จ่ายแล้ว'),
      entityPath: '/expenses/claim',
    });
  });

  it('notifies the recipient when a cash advance is issued', async () => {
    mockPrisma.firmMember.findFirst.mockResolvedValue({ userId: 'u2' });
    mockPrisma.cashAdvance.create.mockResolvedValue({
      id: 'a1', userId: 'u2', amount: 5000, note: 'ค่าเดินทาง',
      user: { id: 'u2', firstName: 'A', lastName: 'B' },
    });
    await advances.issue(owner, { userId: 'u2', amount: 5000, note: 'ค่าเดินทาง' } as any);
    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      userIds: ['u2'],
      actorUserId: 'owner-1',
      summaryText: expect.stringContaining('เงินสำรองจ่าย'),
      entityPath: '/expenses/new',
    });
  });
});
