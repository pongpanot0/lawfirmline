import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class PettyCashService {
  constructor(private prisma: PrismaService) {}

  async getBalance() {
    let fund = await this.prisma.pettyCashFund.findUnique({
      where: { id: 'default' },
    });
    if (!fund) {
      fund = await this.prisma.pettyCashFund.create({
        data: { id: 'default', balance: 50000 },
      });
    }
    return fund;
  }

  async deduct(amount: number) {
    const fund = await this.getBalance();
    if (fund.balance < amount) {
      throw new Error('Insufficient petty cash balance');
    }
    return this.prisma.pettyCashFund.update({
      where: { id: 'default' },
      data: { balance: { decrement: amount } },
    });
  }
}
