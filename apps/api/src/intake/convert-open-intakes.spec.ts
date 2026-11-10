import { convertOpenIntakes } from '../../scripts/convert-open-intakes';
import { IntakeService } from './intake.service';
import { AppModule } from '../app.module';
import { EmailIntakeService } from '../email-intake/email-intake.service';
import { PrismaService } from '../prisma/prisma.module';
import { Test } from '@nestjs/testing';

const prisma = {
  firm: { findMany: jest.fn().mockResolvedValue([{ id: 'f1', slug: 'one' }, { id: 'f2', slug: 'two' }]) },
  firmMember: { findFirst: jest.fn().mockResolvedValue({ userId: 'owner' }) },
};
const intake = { countUnlinked: jest.fn().mockResolvedValue({ count: 3 }), convertUnlinked: jest.fn().mockResolvedValue({ converted: 2, failed: 1, remaining: 1 }) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

it('dry run prints one count per firm without calling conversion', async () => {
  expect(await convertOpenIntakes(prisma as any, intake, true)).toBe(0);
  expect(console.log).toHaveBeenCalledWith('one: would convert 3 open intakes');
  expect(console.log).toHaveBeenCalledWith('two: would convert 3 open intakes');
  expect(intake.convertUnlinked).not.toHaveBeenCalled();
});

it('converts per firm with its owner and reports failures', async () => {
  expect(await convertOpenIntakes(prisma as any, intake, false)).toBe(2);
  expect(intake.convertUnlinked.mock.calls.map(([user]) => user)).toEqual([
    { id: 'owner', firmId: 'f1', firmRole: 'OWNER' }, { id: 'owner', firmId: 'f2', firmRole: 'OWNER' },
  ]);
});

it('the shared legacy conversion leaves rejected and consulted intakes as history', async () => {
  const db = { intake: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) } };
  const service: IntakeService = Object.assign(Object.create(IntakeService.prototype), { prisma: db });
  await service.convertUnlinked({ firmId: 'f1' } as any);
  expect(db.intake.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
    firmId: 'f1', status: { notIn: ['REJECTED', 'CONSULTED'] }, relatedCaseId: null, case: { is: null },
  } }));
});

it('compiles the real circular module wiring without initializing the app or connecting to a database', async () => {
  const app = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue({}).compile();
  expect(app.get(EmailIntakeService)).toBeDefined();
  expect(app.get(IntakeService)).toBeDefined();
  await app.close();
});
