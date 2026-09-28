import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

it('uses the authenticated firm and returns only names, including assistants', async () => {
  const findMany = jest.fn().mockResolvedValue([{ id: 'assistant', firstName: 'ผู้ช่วย', lastName: 'ทดสอบ' }]);
  const service = new UsersService({ user: { findMany } } as unknown as PrismaService);
  const controller = new UsersController(service);
  const result = await controller.findMembers({ firmId: 'active-firm' } as AuthUser);
  expect(findMany).toHaveBeenCalledWith({
    where: { firmMembers: { some: { firmId: 'active-firm' } } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  expect(result).toEqual([{ id: 'assistant', firstName: 'ผู้ช่วย', lastName: 'ทดสอบ' }]);
});
