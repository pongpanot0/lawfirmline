import { PettyCashService } from './petty-cash.service';
import { PrismaService } from '../prisma/prisma.module';

it('keeps concurrent deductions within the balance using the provided transaction', async () => {
  let balance = 100;
  const fund = {
    upsert: jest.fn(async () => ({ balance })),
    updateMany: jest.fn(async ({ where, data }) => {
      if (balance < where.balance.gte) return { count: 0 };
      balance -= data.balance.decrement;
      return { count: 1 };
    }),
    findUniqueOrThrow: jest.fn(async () => ({ balance })),
  };
  const db = { pettyCashFund: fund } as unknown as PrismaService;
  const service = new PettyCashService({} as PrismaService);
  const outcomes = await Promise.allSettled([service.deduct('firm', 70, db), service.deduct('firm', 70, db)]);
  expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
  expect(balance).toBe(30);
  expect(fund.updateMany).toHaveBeenCalledWith({
    where: { firmId: 'firm', balance: { gte: 70 } }, data: { balance: { decrement: 70 } },
  });
});
