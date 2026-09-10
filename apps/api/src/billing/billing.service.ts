import { Injectable, ForbiddenException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AuthUser, ExpenseClaimStatus, ExpenseStatus, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { PettyCashService } from './petty-cash.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import {
  CreateTimeEntryDto,
  CreateExpenseDto,
  CreateStandaloneExpenseDto,
  CreateInvoiceDto,
  UpdateExpenseStatusDto,
  UpdateExpenseClaimStatusDto,
} from './dto/billing.dto';

const RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: PrismaService,
    private pettyCash: PettyCashService,
    private caseAccess: CaseAccessService,
    private config: ConfigService,
    private line: LineMessagingService,
  ) {}

  private getUploadDir() {
    return this.config.get<string>('UPLOAD_DIR') ?? './uploads';
  }

  private decodeOriginalFilename(originalname: string): string {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  }

  private getFileBuffer(file: Express.Multer.File): Buffer {
    if (file.buffer) return file.buffer;
    if (file.path) return fs.readFileSync(file.path);
    throw new BadRequestException('Uploaded file is empty');
  }

  private assertReceiptFile(file: Express.Multer.File) {
    if (!RECEIPT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Receipt must be a JPEG, PNG, WebP, GIF, or PDF file');
    }
  }

  private async attachReceipt(expenseId: string, file: Express.Multer.File) {
    this.assertReceiptFile(file);
    const filename = this.decodeOriginalFilename(file.originalname);
    const uploadDir = path.join(this.getUploadDir(), 'expenses', expenseId);
    fs.mkdirSync(uploadDir, { recursive: true });
    const ext = path.extname(filename);
    const storagePath = path.join(uploadDir, `receipt${ext || ''}`);
    fs.writeFileSync(storagePath, this.getFileBuffer(file));
    await this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        receiptFilename: filename,
        receiptStoragePath: storagePath,
        receiptMimeType: file.mimetype,
      },
    });
  }

  private expenseInclude = {
    user: { select: { id: true, firstName: true, lastName: true, role: true } },
    paidBy: { select: { id: true, firstName: true, lastName: true } },
    case: { select: { id: true, ownRef: true, title: true, courtName: true } },
  };

  private claimInclude = {
    submittedBy: { select: { id: true, firstName: true, lastName: true } },
    reviewedBy: { select: { id: true, firstName: true, lastName: true } },
    paidBy: { select: { id: true, firstName: true, lastName: true } },
    expenses: {
      include: this.expenseInclude,
      orderBy: { date: 'desc' as const },
    },
  };

  private summarizeClaim<T extends {
    id: string;
    status: string;
    submittedAt: Date;
    reviewedAt: Date | null;
    paidAt: Date | null;
    submittedBy: { id: string; firstName: string; lastName: string };
    expenses: Array<{
      id: string;
      amount: number;
      receiptFilename: string | null;
      case: { id: string; ownRef: string; title: string } | null;
    }>;
  }>(claim: T) {
    const caseMap = new Map<string, { id: string; ownRef: string; title: string }>();
    for (const expense of claim.expenses) {
      if (expense.case) caseMap.set(expense.case.id, expense.case);
    }
    return {
      id: claim.id,
      status: claim.status,
      submittedAt: claim.submittedAt,
      reviewedAt: claim.reviewedAt,
      paidAt: claim.paidAt,
      submittedBy: claim.submittedBy,
      totalAmount: claim.expenses.reduce((sum, e) => sum + e.amount, 0),
      itemCount: claim.expenses.length,
      receiptCount: claim.expenses.filter((e) => e.receiptFilename).length,
      cases: [...caseMap.values()],
      expenses: claim.expenses,
    };
  }

  private getFirmExpenseFilter(firmId: string) {
    return {
      OR: [
        { case: { firmId } },
        { caseId: null, user: { firmMembers: { some: { firmId } } } },
      ],
    };
  }

  /**
   * Drafts stay private to the author until they submit to the owner.
   * Owners see every submitted firm claim; lawyers see only their own rows.
   */
  private getExpenseVisibilityFilter(user: AuthUser) {
    const firmFilter = this.getFirmExpenseFilter(user.firmId);
    if (user.firmRole !== FirmRole.OWNER) {
      return { AND: [firmFilter, { userId: user.id }] };
    }
    return {
      AND: [
        firmFilter,
        {
          OR: [{ status: { not: ExpenseStatus.DRAFT } }, { userId: user.id }],
        },
      ],
    };
  }

  async getExpenseSummary(caseId: string) {
    const [approved, legalCase, timeEntries, invoices] = await Promise.all([
      this.prisma.expense.aggregate({
        where: { caseId, status: { in: ['APPROVED', 'PAID'] } },
        _sum: { amount: true },
      }),
      this.prisma.case.findUnique({
        where: { id: caseId },
        select: { estimatedFee: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { caseId, billable: true },
        select: { hours: true, rate: true },
      }),
      this.prisma.invoice.aggregate({
        where: { caseId },
        _sum: { totalAmount: true },
      }),
    ]);

    const expenses = approved._sum.amount ?? 0;
    const timeRevenue = timeEntries.reduce((sum, e) => sum + e.hours * e.rate, 0);
    const invoiceRevenue = invoices._sum.totalAmount ?? 0;
    const { revenue } = this.resolveCaseRevenue(
      legalCase?.estimatedFee,
      timeRevenue,
      invoiceRevenue,
    );

    return {
      totalSpent: expenses,
      revenue,
      profit: revenue - expenses,
    };
  }

  private resolveCaseRevenue(
    estimatedFee: number | null | undefined,
    timeRevenue: number,
    invoiceRevenue: number,
  ): { revenue: number; revenueSource: 'estimated' | 'time' | 'invoice' | 'none' } {
    if (estimatedFee != null && estimatedFee > 0) {
      return { revenue: estimatedFee, revenueSource: 'estimated' };
    }
    if (timeRevenue > 0) {
      return { revenue: timeRevenue, revenueSource: 'time' };
    }
    if (invoiceRevenue > 0) {
      return { revenue: invoiceRevenue, revenueSource: 'invoice' };
    }
    return { revenue: 0, revenueSource: 'none' };
  }

  async getCaseProfits(user: AuthUser) {
    const caseFilter = this.caseAccess.getCaseFilterForFinancials(user);
    const cases = await this.prisma.case.findMany({
      where: caseFilter,
      select: {
        id: true,
        ownRef: true,
        title: true,
        status: true,
        estimatedFee: true,
        clientName: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (cases.length === 0) return [];

    const caseIds = cases.map((c) => c.id);

    const [expenseGroups, timeEntries, invoiceGroups] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['caseId'],
        where: {
          caseId: { in: caseIds },
          status: { in: ['APPROVED', 'PAID'] },
        },
        _sum: { amount: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { caseId: { in: caseIds }, billable: true },
        select: { caseId: true, hours: true, rate: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['caseId'],
        where: { caseId: { in: caseIds } },
        _sum: { totalAmount: true },
      }),
    ]);

    const expenseMap = new Map(
      expenseGroups.map((row) => [row.caseId, row._sum.amount ?? 0]),
    );
    const timeMap = new Map<string, number>();
    for (const entry of timeEntries) {
      timeMap.set(
        entry.caseId,
        (timeMap.get(entry.caseId) ?? 0) + entry.hours * entry.rate,
      );
    }
    const invoiceMap = new Map(
      invoiceGroups.map((row) => [row.caseId, row._sum.totalAmount ?? 0]),
    );

    return cases.map((legalCase) => {
      const timeRevenue = timeMap.get(legalCase.id) ?? 0;
      const invoiceRevenue = invoiceMap.get(legalCase.id) ?? 0;
      const expenses = expenseMap.get(legalCase.id) ?? 0;
      const { revenue, revenueSource } = this.resolveCaseRevenue(
        legalCase.estimatedFee,
        timeRevenue,
        invoiceRevenue,
      );

      return {
        caseId: legalCase.id,
        ownRef: legalCase.ownRef,
        title: legalCase.title,
        status: legalCase.status,
        clientName: legalCase.client?.name ?? legalCase.clientName ?? null,
        revenue,
        revenueSource,
        expenses,
        profit: revenue - expenses,
      };
    }).sort((a, b) => b.profit - a.profit);
  }

  async getPettyCashBalance(firmId: string) {
    return this.pettyCash.getBalance(firmId);
  }

  async getTimeEntries(caseId: string) {
    return this.prisma.timeEntry.findMany({
      where: { caseId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async createTimeEntry(user: AuthUser, caseId: string, dto: CreateTimeEntryDto) {
    return this.prisma.timeEntry.create({
      data: {
        caseId,
        userId: user.id,
        hours: dto.hours,
        rate: dto.rate ?? 0,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
        billable: dto.billable ?? true,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async getExpenses(user: AuthUser, caseId: string) {
    return this.prisma.expense.findMany({
      where: {
        caseId,
        OR: [{ status: { not: ExpenseStatus.DRAFT } }, { userId: user.id }],
      },
      include: this.expenseInclude,
      orderBy: { date: 'desc' },
    });
  }

  async createExpense(
    user: AuthUser,
    caseId: string,
    dto: CreateExpenseDto,
    receipt?: Express.Multer.File,
  ) {
    await this.assertSourceEventOnCase(dto.sourceEventId, caseId);
    const expense = await this.prisma.expense.create({
      data: {
        caseId,
        userId: user.id,
        amount: dto.amount,
        description: dto.description,
        category: dto.category,
        expensePurpose: dto.expensePurpose,
        date: dto.date ? new Date(dto.date) : new Date(),
        sourceEventId: dto.sourceEventId ?? null,
        // Omitted means a claim, which is what every existing caller sends.
        status: dto.status ?? ExpenseStatus.PENDING,
      },
      include: this.expenseInclude,
    });
    if (receipt) {
      await this.attachReceipt(expense.id, receipt);
      return this.prisma.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: this.expenseInclude,
      });
    }
    return expense;
  }

  /** A cost may only name a hearing on the case it is being charged to. */
  private async assertSourceEventOnCase(
    sourceEventId: string | undefined,
    caseId: string | null | undefined,
  ) {
    if (!sourceEventId) return;
    if (!caseId) {
      throw new BadRequestException('ค่าใช้จ่ายที่อ้างถึงนัดต้องระบุคดีด้วย');
    }
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: sourceEventId, caseId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('ไม่พบนัดที่อ้างถึงในคดีนี้');
  }

  async createStandaloneExpense(
    user: AuthUser,
    dto: CreateStandaloneExpenseDto,
    receipt?: Express.Multer.File,
  ) {
    if (dto.caseId) {
      const legalCase = await this.prisma.case.findFirst({
        where: { id: dto.caseId, firmId: user.firmId },
      });
      if (!legalCase) throw new NotFoundException('Case not found');
    }
    await this.assertSourceEventOnCase(dto.sourceEventId, dto.caseId);
    const expense = await this.prisma.expense.create({
      data: {
        caseId: dto.caseId ?? null,
        userId: user.id,
        amount: dto.amount,
        description: dto.description,
        category: dto.category,
        expensePurpose: dto.expensePurpose,
        date: dto.date ? new Date(dto.date) : new Date(),
        sourceEventId: dto.sourceEventId ?? null,
        // Standalone claims from /expenses start as drafts so the lawyer can
        // tick, print, and only then send them to the owner.
        status: dto.status ?? ExpenseStatus.DRAFT,
      },
      include: this.expenseInclude,
    });
    if (receipt) {
      await this.attachReceipt(expense.id, receipt);
      return this.prisma.expense.findUniqueOrThrow({
        where: { id: expense.id },
        include: this.expenseInclude,
      });
    }
    return expense;
  }

  async getReceiptFile(user: AuthUser, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, ...this.getFirmExpenseFilter(user.firmId) },
      select: {
        userId: true,
        receiptFilename: true,
        receiptStoragePath: true,
        receiptMimeType: true,
      },
    });
    if (!expense?.receiptStoragePath || !expense.receiptFilename) {
      throw new NotFoundException('Receipt not found');
    }
    if (user.firmRole !== FirmRole.OWNER && expense.userId !== user.id) {
      throw new ForbiddenException('Cannot access this receipt');
    }
    return {
      path: expense.receiptStoragePath,
      filename: expense.receiptFilename,
      mimeType: expense.receiptMimeType ?? 'application/octet-stream',
    };
  }

  async getAllExpenses(
    user: AuthUser,
    filters?: { status?: ExpenseStatus; userId?: string },
  ) {
    const statusFilter = filters?.status ? { status: filters.status } : {};
    const requesterFilter =
      user.firmRole === FirmRole.OWNER && filters?.userId
        ? { userId: filters.userId }
        : {};

    return this.prisma.expense.findMany({
      where: {
        AND: [this.getExpenseVisibilityFilter(user), statusFilter, requesterFilter],
      },
      include: this.expenseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFinanceSummary(user: AuthUser) {
    const { firmId } = user;
    const isOwner = user.firmRole === FirmRole.OWNER;
    const caseFilter = this.caseAccess.getCaseFilterForFinancials(user);
    const expenseFilter = this.getExpenseVisibilityFilter(user);

    const [expenses, timeEntries, pettyCash, caseProfits] = await Promise.all([
      this.prisma.expense.findMany({
        where: expenseFilter,
        select: { amount: true, status: true, userId: true },
      }),
      this.prisma.timeEntry.findMany({
        where: { case: caseFilter, billable: true },
        select: { hours: true, rate: true },
      }),
      isOwner ? this.pettyCash.getBalance(firmId) : Promise.resolve({ balance: 0 }),
      this.getCaseProfits(user),
    ]);

    const timeRevenue = timeEntries.reduce((sum, entry) => sum + entry.hours * entry.rate, 0);
    const totalCaseRevenue = caseProfits.reduce((sum, row) => sum + row.revenue, 0);
    const revenue = totalCaseRevenue > 0 ? totalCaseRevenue : timeRevenue;
    // Firm-wide money figures ignore drafts — those are private until claimed.
    const submitted = expenses.filter((e) => e.status !== ExpenseStatus.DRAFT);
    const totalExpenses = submitted.reduce((sum, e) => sum + e.amount, 0);
    const approvedExpenses = expenses
      .filter((e) => e.status === 'APPROVED' || e.status === 'PAID')
      .reduce((sum, e) => sum + e.amount, 0);
    const outstanding = expenses
      .filter((e) => e.status === 'PENDING')
      .reduce((sum, e) => sum + e.amount, 0);
    const draftExpenses = expenses.filter(
      (e) => e.status === ExpenseStatus.DRAFT && e.userId === user.id,
    );
    const draftTotal = draftExpenses.reduce((sum, e) => sum + e.amount, 0);

    const netProfit = caseProfits.reduce((sum, row) => sum + row.profit, 0);

    return {
      firmId,
      firmName: user.firmName,
      scope: isOwner ? 'firm' : 'user',
      revenue,
      totalExpenses,
      approvedExpenses,
      outstanding,
      draftTotal,
      netProfit,
      caseProfits,
      pettyCashBalance: pettyCash.balance,
      pendingCount: expenses.filter((e) => e.status === 'PENDING').length,
      draftCount: draftExpenses.length,
      expenseCount: submitted.length,
    };
  }

  async getFirmInvoices(user: AuthUser) {
    const caseFilter = this.caseAccess.getCaseFilterForFinancials(user);
    const invoices = await this.prisma.invoice.findMany({
      where: { case: caseFilter },
      include: {
        case: {
          select: {
            ownRef: true,
            title: true,
            clientName: true,
            client: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      totalAmount: invoice.totalAmount,
      dueAt: invoice.dueAt,
      ownRef: invoice.case.ownRef,
      clientName: invoice.case.client?.name ?? invoice.case.clientName ?? invoice.case.title,
    }));
  }

  async updateExpenseStatus(
    user: AuthUser,
    expenseId: string,
    dto: UpdateExpenseStatusDto,
  ) {
    // Submitting a draft is the author's own move, not the owner's: a draft is
    // the author's note to themselves until they claim it.
    const submitting = dto.status === ExpenseStatus.PENDING;
    if (!submitting && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Only owner can update expense status');
    }

    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, ...this.getFirmExpenseFilter(user.firmId) },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    if (submitting) {
      if (expense.status !== ExpenseStatus.DRAFT) {
        throw new BadRequestException('เบิกได้เฉพาะรายการที่ยังเป็นร่าง');
      }
      if (expense.userId !== user.id && user.firmRole !== FirmRole.OWNER) {
        throw new ForbiddenException('ส่งเบิกได้เฉพาะรายการของตัวเอง');
      }
    }

    // Claim-round expenses must be approved/paid/rejected as a batch.
    if (
      expense.claimId &&
      !submitting &&
      (dto.status === ExpenseStatus.APPROVED ||
        dto.status === ExpenseStatus.PAID ||
        dto.status === ExpenseStatus.REJECTED)
    ) {
      throw new BadRequestException('อนุมัติผ่านใบเบิกทั้งรอบเท่านั้น');
    }

    // A draft was never claimed, so approving it directly would skip the petty
    // cash deduction that approval is supposed to make. It has to be submitted
    // first.
    if (
      expense.status === ExpenseStatus.DRAFT &&
      (dto.status === ExpenseStatus.APPROVED || dto.status === ExpenseStatus.PAID)
    ) {
      throw new BadRequestException('ต้องส่งขออนุมัติก่อนจึงจะอนุมัติหรือจ่ายได้');
    }

    if (submitting) {
      const claim = await this.createClaimFromExpenses(user, [expense.id]);
      return claim.expenses.find((row) => row.id === expense.id) ?? claim.expenses[0];
    }

    const data: {
      status: ExpenseStatus;
      paidAt?: Date;
      paidById?: string;
    } = { status: dto.status };

    if (dto.status === ExpenseStatus.APPROVED && expense.status === ExpenseStatus.PENDING) {
      try {
        await this.pettyCash.deduct(user.firmId, expense.amount);
      } catch {
        throw new BadRequestException('Insufficient petty cash fund');
      }
    }

    if (dto.status === ExpenseStatus.PAID) {
      data.paidAt = new Date();
      data.paidById = user.id;
    }

    return this.prisma.expense.update({
      where: { id: expenseId },
      data,
      include: this.expenseInclude,
    });
  }

  async submitExpensesForApproval(user: AuthUser, expenseIds: string[]) {
    return this.createClaimFromExpenses(user, expenseIds);
  }

  private async createClaimFromExpenses(user: AuthUser, expenseIds: string[]) {
    if (!expenseIds.length) {
      throw new BadRequestException('เลือกอย่างน้อย 1 รายการ');
    }

    const uniqueIds = [...new Set(expenseIds)];
    const expenses = await this.prisma.expense.findMany({
      where: {
        id: { in: uniqueIds },
        ...this.getFirmExpenseFilter(user.firmId),
      },
      include: this.expenseInclude,
    });

    if (expenses.length !== uniqueIds.length) {
      throw new NotFoundException('ไม่พบรายการค่าใช้จ่ายบางรายการ');
    }

    for (const expense of expenses) {
      if (expense.status !== ExpenseStatus.DRAFT) {
        throw new BadRequestException('เบิกได้เฉพาะรายการที่ยังเป็นร่าง');
      }
      if (expense.claimId) {
        throw new BadRequestException('รายการนี้อยู่ในใบเบิกแล้ว');
      }
      if (expense.userId !== user.id && user.firmRole !== FirmRole.OWNER) {
        throw new ForbiddenException('ส่งเบิกได้เฉพาะรายการของตัวเอง');
      }
    }

    const claim = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expenseClaim.create({
        data: {
          firmId: user.firmId,
          submittedById: user.id,
          status: ExpenseClaimStatus.PENDING,
        },
      });

      await tx.expense.updateMany({
        where: { id: { in: uniqueIds } },
        data: {
          status: ExpenseStatus.PENDING,
          claimId: created.id,
        },
      });

      return tx.expenseClaim.findUniqueOrThrow({
        where: { id: created.id },
        include: this.claimInclude,
      });
    });

    const summary = this.summarizeClaim(claim);
    await this.notifyOwnersOfExpenseClaim(user, summary);
    return summary;
  }

  async getExpenseClaims(
    user: AuthUser,
    filters?: { status?: ExpenseClaimStatus; userId?: string },
  ) {
    const where = {
      firmId: user.firmId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(user.firmRole === FirmRole.OWNER
        ? filters?.userId
          ? { submittedById: filters.userId }
          : {}
        : { submittedById: user.id }),
    };

    const claims = await this.prisma.expenseClaim.findMany({
      where,
      include: this.claimInclude,
      orderBy: { submittedAt: 'desc' },
    });

    return claims.map((claim) => this.summarizeClaim(claim));
  }

  async getExpenseClaim(user: AuthUser, claimId: string) {
    const claim = await this.prisma.expenseClaim.findFirst({
      where: {
        id: claimId,
        firmId: user.firmId,
        ...(user.firmRole === FirmRole.OWNER ? {} : { submittedById: user.id }),
      },
      include: this.claimInclude,
    });
    if (!claim) throw new NotFoundException('ไม่พบใบเบิก');
    return this.summarizeClaim(claim);
  }

  async updateExpenseClaimStatus(
    user: AuthUser,
    claimId: string,
    dto: UpdateExpenseClaimStatusDto,
  ) {
    if (user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Only owner can update claim status');
    }

    const claim = await this.prisma.expenseClaim.findFirst({
      where: { id: claimId, firmId: user.firmId },
      include: { expenses: true },
    });
    if (!claim) throw new NotFoundException('ไม่พบใบเบิก');
    if (!claim.expenses.length) {
      throw new BadRequestException('ใบเบิกไม่มีรายการ');
    }

    const next = dto.status;
    if (next === ExpenseClaimStatus.APPROVED) {
      if (claim.status !== ExpenseClaimStatus.PENDING) {
        throw new BadRequestException('อนุมัติได้เฉพาะใบเบิกที่รออนุมัติ');
      }
      const total = claim.expenses.reduce((sum, e) => sum + e.amount, 0);
      try {
        await this.pettyCash.deduct(user.firmId, total);
      } catch {
        throw new BadRequestException('Insufficient petty cash fund');
      }
    } else if (next === ExpenseClaimStatus.REJECTED) {
      if (claim.status !== ExpenseClaimStatus.PENDING) {
        throw new BadRequestException('ปฏิเสธได้เฉพาะใบเบิกที่รออนุมัติ');
      }
    } else if (next === ExpenseClaimStatus.PAID) {
      if (claim.status !== ExpenseClaimStatus.APPROVED) {
        throw new BadRequestException('จ่ายได้เฉพาะใบเบิกที่อนุมัติแล้ว');
      }
    } else {
      throw new BadRequestException('สถานะไม่ถูกต้อง');
    }

    const now = new Date();
    const expenseStatus =
      next === ExpenseClaimStatus.APPROVED
        ? ExpenseStatus.APPROVED
        : next === ExpenseClaimStatus.REJECTED
          ? ExpenseStatus.REJECTED
          : ExpenseStatus.PAID;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.expense.updateMany({
        where: { claimId },
        data: {
          status: expenseStatus,
          ...(next === ExpenseClaimStatus.PAID
            ? { paidAt: now, paidById: user.id }
            : {}),
        },
      });

      return tx.expenseClaim.update({
        where: { id: claimId },
        data: {
          status: next,
          ...(next === ExpenseClaimStatus.APPROVED || next === ExpenseClaimStatus.REJECTED
            ? { reviewedAt: now, reviewedById: user.id }
            : {}),
          ...(next === ExpenseClaimStatus.PAID
            ? { paidAt: now, paidById: user.id }
            : {}),
        },
        include: this.claimInclude,
      });
    });

    return this.summarizeClaim(updated);
  }

  private async notifyOwnersOfExpenseClaim(
    submitter: AuthUser,
    claim: { id: string; totalAmount: number; itemCount: number },
  ) {
    const owners = await this.prisma.firmMember.findMany({
      where: { firmId: submitter.firmId, role: FirmRole.OWNER },
      include: {
        user: { select: { lineUserId: true, firstName: true, lastName: true } },
      },
    });

    const ownerLineIds = owners
      .map((member) => member.user.lineUserId)
      .filter((id): id is string => Boolean(id));

    if (!ownerLineIds.length || !this.line.isConfigured()) return;

    const webUrl =
      this.config.get<string>('WEB_APP_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:3005';
    const link = `${webUrl.replace(/\/$/, '')}/admin/reimbursements?status=PENDING`;
    const submitterName = `${submitter.firstName ?? ''} ${submitter.lastName ?? ''}`.trim() || 'ทนายความ';
    const message =
      `📋 ${submitterName} ส่งใบเบิก ${claim.itemCount} รายการ\n` +
      `รวม ฿${claim.totalAmount.toLocaleString('th-TH')}\n\n` +
      `🔗 ${link}`;

    for (const lineUserId of ownerLineIds) {
      try {
        await this.line.pushTo(lineUserId, message);
      } catch (error) {
        this.logger.warn(`Failed to notify owner ${lineUserId} about expense claim: ${error}`);
      }
    }
  }

  async getInvoices(caseId: string) {
    return this.prisma.invoice.findMany({
      where: { caseId },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvoice(user: AuthUser, caseId: string, dto: CreateInvoiceDto) {
    const lineItems = dto.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.quantity * item.unitPrice,
    }));
    const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

    const count = await this.prisma.invoice.count();
    const invoiceNumber = dto.invoiceNumber ?? `INV-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.invoice.create({
      data: {
        caseId,
        invoiceNumber,
        totalAmount,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        createdById: user.id,
        lineItems: { create: lineItems },
      },
      include: { lineItems: true },
    });
  }
}
