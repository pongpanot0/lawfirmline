import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class PettyCashService {
  constructor(private prisma: PrismaService) {}

  async getBalance(firmId: string) {
    let fund = await this.prisma.pettyCashFund.findUnique({
      where: { firmId },
    });
    if (!fund) {
      fund = await this.prisma.pettyCashFund.create({
        data: { firmId, balance: 50000 },
      });
    }
    return fund;
  }

  async deduct(firmId: string, amount: number) {
    const fund = await this.getBalance(firmId);
    if (fund.balance < amount) {
      throw new Error('Insufficient petty cash balance');
    }
    return this.prisma.pettyCashFund.update({
      where: { firmId },
      data: { balance: { decrement: amount } },
    });
  }
}
