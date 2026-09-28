import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';

@Injectable()
export class PettyCashService {
  constructor(private prisma: PrismaService) {}

  async getBalance(firmId: string, db: Prisma.TransactionClient = this.prisma) {
    return db.pettyCashFund.upsert({
      where: { firmId },
      create: { firmId, balance: 50000 },
      update: {},
    });
  }

  async deduct(firmId: string, amount: number, db: Prisma.TransactionClient = this.prisma) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid petty cash amount');
    await this.getBalance(firmId, db);
    const changed = await db.pettyCashFund.updateMany({
      where: { firmId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (!changed.count) {
      throw new Error('Insufficient petty cash balance');
    }
    return db.pettyCashFund.findUniqueOrThrow({
      where: { firmId },
    });
  }
}
