import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, EXPENSE_CATEGORIES, FirmRole, hasFirmCapability } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationCategory, Prisma } from '../generated/prisma';
import { IssueCashAdvanceDto } from './dto/billing.dto';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

const COURT_FEE_CATEGORY = EXPENSE_CATEGORIES.find((category) => category === 'ค่าธรรมเนียมศาล');

@Injectable()
export class CashAdvanceService {
  constructor(
    private prisma: PrismaService,
    private assignmentNotifier: AssignmentNotifierService,
  ) {}

  async issue(owner: AuthUser, dto: IssueCashAdvanceDto) {
    if (!hasFirmCapability(owner.firmRole, 'issueCashAdvance')) {
      throw new ForbiddenException('Only the owner can issue a cash advance');
    }
    const member = await this.prisma.firmMember.findFirst({
      where: { role: { not: FirmRole.EXTERNAL }, userId: dto.userId, firmId: owner.firmId },
    });
    if (!member) throw new NotFoundException('User is not a member of this firm');

    const advance = await this.prisma.cashAdvance.create({
      data: {
        firmId: owner.firmId,
        userId: dto.userId,
        amount: dto.amount,
        remaining: dto.amount,
        note: dto.note,
        issuedById: owner.id,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.assignmentNotifier.notifyAssigned({
      category: NotificationCategory.BILLING,
      firmId: owner.firmId,
      userIds: [dto.userId],
      actorUserId: owner.id,
      summaryText: `💰 คุณได้รับเงินสำรองจ่าย ฿${dto.amount.toLocaleString('th-TH')}${dto.note ? `\nหมายเหตุ: ${dto.note}` : ''}`,
      entityPath: '/expenses/new',
    });

    return advance;
  }

  /** Everyone sees their own advances; the owner sees the whole firm's. */
  async list(user: AuthUser, userId?: string) {
    if (userId && userId !== user.id && !hasFirmCapability(user.firmRole, 'issueCashAdvance')) {
      throw new ForbiddenException("Cannot view another user's cash advances");
    }
    return this.prisma.cashAdvance.findMany({
      where: {
        firmId: user.firmId,
        userId: userId ?? (hasFirmCapability(user.firmRole, 'issueCashAdvance') ? undefined : user.id),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /** Advances with money left to spend, for the "paid from advance" picker on the new-expense form. */
  async listMineWithBalance(user: AuthUser) {
    return this.prisma.cashAdvance.findMany({
      where: { firmId: user.firmId, userId: user.id, settledAt: null, remaining: { gt: 0 } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async recordReturn(user: AuthUser, advanceId: string, amount: number, note?: string) {
    if (!hasFirmCapability(user.firmRole, 'issueCashAdvance')) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์จัดการเงินสำรองจ่าย');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('ยอดเงินคืนต้องมากกว่า 0');
    }
    return this.prisma.$transaction(async (tx) => {
      const where = { id: advanceId, firmId: user.firmId };
      const advance = await tx.cashAdvance.findFirst({ where });
      if (!advance) throw new NotFoundException('ไม่พบเงินสำรองจ่ายนี้');
      if (advance.settledAt) throw new ConflictException('เงินสำรองจ่ายนี้ปิดยอดแล้ว');
      if (amount > advance.remaining) throw new BadRequestException('ยอดเงินคืนเกินเงินสำรองจ่ายคงเหลือ');

      const updated = await tx.cashAdvance.updateMany({
        where: { ...where, settledAt: null, remaining: { gte: amount, equals: advance.remaining } },
        // Float balances must stay at satang precision so a fully used/returned advance can settle.
        data: {
          remaining: Math.round((advance.remaining - amount) * 100) / 100,
          returnedAmount: Math.round((advance.returnedAmount + amount) * 100) / 100,
        },
      });
      if (updated.count !== 1) throw new ConflictException('ยอดเงินสำรองจ่ายเปลี่ยนแปลง กรุณาลองใหม่');
      await tx.auditLog.create({ data: {
        firmId: user.firmId, userId: user.id, action: 'CASH_ADVANCE_RETURNED',
        metadata: { advanceId, amount, note: note ?? null },
      } });
      return tx.cashAdvance.findFirstOrThrow({ where });
    });
  }

  async settle(user: AuthUser, advanceId: string, note?: string) {
    if (!hasFirmCapability(user.firmRole, 'issueCashAdvance')) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์จัดการเงินสำรองจ่าย');
    }
    return this.prisma.$transaction(async (tx) => {
      const where = { id: advanceId, firmId: user.firmId };
      const advance = await tx.cashAdvance.findFirst({ where });
      if (!advance) throw new NotFoundException('ไม่พบเงินสำรองจ่ายนี้');
      if (advance.settledAt) throw new ConflictException('เงินสำรองจ่ายนี้ปิดยอดแล้ว');
      // Pre-branch consume used float decrement, so old rows can hold sub-satang dust (e.g. 1e-13).
      if (Math.round(advance.remaining * 100) > 0) throw new ConflictException('ต้องใช้หรือคืนเงินสำรองจ่ายให้ครบก่อนปิดยอด');

      const updated = await tx.cashAdvance.updateMany({
        where: { ...where, settledAt: null, remaining: { lt: 0.005 } },
        data: { remaining: 0, settledAt: new Date(), settledById: user.id, settlementNote: note ?? null },
      });
      if (updated.count !== 1) throw new ConflictException('ยอดเงินสำรองจ่ายเปลี่ยนแปลง กรุณาลองใหม่');
      await tx.auditLog.create({ data: {
        firmId: user.firmId, userId: user.id, action: 'CASH_ADVANCE_SETTLED',
        metadata: { advanceId, note: note ?? null },
      } });
      return tx.cashAdvance.findFirstOrThrow({ where });
    });
  }

  async reconciliation(user: AuthUser, filters: { status?: 'open' | 'settled' } = {}) {
    if (!hasFirmCapability(user.firmRole, 'issueCashAdvance')) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์จัดการเงินสำรองจ่าย');
    }
    const advances = await this.prisma.cashAdvance.findMany({
      where: {
        firmId: user.firmId,
        ...(filters.status ? { settledAt: filters.status === 'open' ? null : { not: null } } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        expenses: {
          where: { paidFromAdvance: { firmId: user.firmId } },
          select: { category: true, receiptFilename: true, officialReceiptNo: true },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
    return advances.map((advance) => ({
      id: advance.id,
      user: advance.user,
      issuedAt: advance.issuedAt,
      amount: advance.amount,
      spent: advance.amount - advance.remaining - advance.returnedAmount,
      returnedAmount: advance.returnedAmount,
      remaining: advance.remaining,
      missingReceiptFiles: advance.expenses.filter((expense) => expense.receiptFilename === null).length,
      courtFeesMissingReceiptNo: advance.expenses.filter((expense) =>
        expense.category === COURT_FEE_CATEGORY && !expense.officialReceiptNo?.trim(),
      ).length,
      settledAt: advance.settledAt,
    }));
  }

  async listExpenses(user: AuthUser, advanceId: string) {
    if (!hasFirmCapability(user.firmRole, 'issueCashAdvance')) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์จัดการเงินสำรองจ่าย');
    }
    const advance = await this.prisma.cashAdvance.findFirst({
      where: { id: advanceId, firmId: user.firmId }, select: { id: true },
    });
    if (!advance) throw new NotFoundException('ไม่พบเงินสำรองจ่ายนี้');
    return this.prisma.expense.findMany({
      where: { paidFromAdvanceId: advanceId, paidFromAdvance: { firmId: user.firmId } },
      select: { id: true, date: true, description: true, category: true, amount: true,
        receiptFilename: true, officialReceiptNo: true, caseId: true },
      orderBy: { date: 'desc' },
    });
  }

  /** Called from within BillingService's expense-create transaction — throws if the advance can't cover the amount. */
  async consume(tx: Prisma.TransactionClient, firmId: string, userId: string, advanceId: string, amount: number) {
    const advance = await tx.cashAdvance.findFirst({ where: { id: advanceId, firmId, userId } });
    if (!advance) throw new NotFoundException('ไม่พบเงินสำรองจ่ายนี้');
    if (advance.settledAt) throw new ConflictException('เงินสำรองจ่ายนี้ปิดยอดแล้ว');
    if (advance.remaining < amount) {
      throw new BadRequestException('เงินสำรองจ่ายคงเหลือไม่พอ');
    }
    const updated = await tx.cashAdvance.updateMany({
      where: { id: advanceId, firmId, userId, settledAt: null, remaining: { gte: amount, equals: advance.remaining } },
      data: { remaining: Math.round((advance.remaining - amount) * 100) / 100 },
    });
    if (updated.count !== 1) throw new ConflictException('ยอดเงินสำรองจ่ายเปลี่ยนแปลง กรุณาลองใหม่');
  }
}
