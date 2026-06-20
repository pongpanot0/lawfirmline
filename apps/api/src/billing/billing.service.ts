import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuthUser, Role, ExpenseStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { PettyCashService } from './petty-cash.service';
import {
  CreateTimeEntryDto,
  CreateExpenseDto,
  CreateStandaloneExpenseDto,
  CreateInvoiceDto,
  UpdateExpenseStatusDto,
} from './dto/billing.dto';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private pettyCash: PettyCashService,
  ) {}

  private expenseInclude = {
    user: { select: { id: true, firstName: true, lastName: true, role: true } },
    paidBy: { select: { id: true, firstName: true, lastName: true } },
    case: { select: { id: true, caseNumber: true, title: true, courtName: true } },
  };

  async getExpenseSummary(caseId: string) {
    const approved = await this.prisma.expense.aggregate({
      where: { caseId, status: { in: ['APPROVED', 'PAID'] } },
      _sum: { amount: true },
    });
    return { totalSpent: approved._sum.amount ?? 0 };
  }

  async getPettyCashBalance() {
    return this.pettyCash.getBalance();
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

  async getExpenses(caseId: string) {
    return this.prisma.expense.findMany({
      where: { caseId },
      include: this.expenseInclude,
      orderBy: { date: 'desc' },
    });
  }

  async createExpense(user: AuthUser, caseId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        caseId,
        userId: user.id,
        amount: dto.amount,
        description: dto.description,
        category: dto.category,
        expensePurpose: dto.expensePurpose,
        date: dto.date ? new Date(dto.date) : new Date(),
        status: ExpenseStatus.PENDING,
      },
      include: this.expenseInclude,
    });
  }

  async createStandaloneExpense(user: AuthUser, dto: CreateStandaloneExpenseDto) {
    if (user.role === Role.CLERK) {
      throw new ForbiddenException('Clerks cannot submit expenses');
    }
    return this.prisma.expense.create({
      data: {
        caseId: dto.caseId ?? null,
        userId: user.id,
        amount: dto.amount,
        description: dto.description,
        category: dto.category,
        expensePurpose: dto.expensePurpose,
        date: dto.date ? new Date(dto.date) : new Date(),
        status: ExpenseStatus.PENDING,
      },
      include: this.expenseInclude,
    });
  }

  async getAllExpenses(user: AuthUser, status?: ExpenseStatus) {
    if (user.role !== Role.ADMIN) {
      return this.prisma.expense.findMany({
        where: { userId: user.id, ...(status ? { status } : {}) },
        include: this.expenseInclude,
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.expense.findMany({
      where: status ? { status } : undefined,
      include: this.expenseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateExpenseStatus(
    user: AuthUser,
    expenseId: string,
    dto: UpdateExpenseStatusDto,
  ) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admin can update expense status');
    }

    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
    });
    if (!expense) throw new NotFoundException('Expense not found');

    const data: {
      status: ExpenseStatus;
      paidAt?: Date;
      paidById?: string;
    } = { status: dto.status };

    if (dto.status === ExpenseStatus.APPROVED && expense.status === ExpenseStatus.PENDING) {
      try {
        await this.pettyCash.deduct(expense.amount);
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

  async getInvoices(caseId: string) {
    return this.prisma.invoice.findMany({
      where: { caseId },
      include: { lineItems: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvoice(user: AuthUser, caseId: string, dto: CreateInvoiceDto) {
    if (user.role === Role.CLERK) {
      throw new ForbiddenException('Clerks cannot create invoices');
    }

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
