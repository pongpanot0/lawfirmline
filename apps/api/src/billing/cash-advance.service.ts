import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { IssueCashAdvanceDto } from './dto/billing.dto';

@Injectable()
export class CashAdvanceService {
  constructor(private prisma: PrismaService) {}

  async issue(owner: AuthUser, dto: IssueCashAdvanceDto) {
    if (owner.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Only the owner can issue a cash advance');
    }
    const member = await this.prisma.firmMember.findFirst({
      where: { userId: dto.userId, firmId: owner.firmId },
    });
    if (!member) throw new NotFoundException('User is not a member of this firm');

    return this.prisma.cashAdvance.create({
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
  }

  /** Everyone sees their own advances; the owner sees the whole firm's. */
  async list(user: AuthUser, userId?: string) {
    if (userId && userId !== user.id && user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException("Cannot view another user's cash advances");
    }
    return this.prisma.cashAdvance.findMany({
      where: {
        firmId: user.firmId,
        userId: userId ?? (user.firmRole === FirmRole.OWNER ? undefined : user.id),
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /** Advances with money left to spend, for the "paid from advance" picker on the new-expense form. */
  async listMineWithBalance(user: AuthUser) {
    return this.prisma.cashAdvance.findMany({
      where: { firmId: user.firmId, userId: user.id, remaining: { gt: 0 } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /** Called from within BillingService's expense-create transaction — throws if the advance can't cover the amount. */
  async consume(tx: Prisma.TransactionClient, firmId: string, userId: string, advanceId: string, amount: number) {
    const advance = await tx.cashAdvance.findFirst({ where: { id: advanceId, firmId, userId } });
    if (!advance) throw new NotFoundException('ไม่พบเงินสำรองจ่ายนี้');
    if (advance.remaining < amount) {
      throw new BadRequestException('เงินสำรองจ่ายคงเหลือไม่พอ');
    }
    await tx.cashAdvance.update({ where: { id: advanceId }, data: { remaining: { decrement: amount } } });
  }
}
