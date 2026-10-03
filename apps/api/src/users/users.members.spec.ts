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

describe('admin /users is bound to the caller\'s firm', () => {
  const owner = { id: 'owner-a', firmId: 'firm-a' } as AuthUser;

  it('lists only the caller\'s firm, without secrets', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const controller = new UsersController(new UsersService({ user: { findMany } } as unknown as PrismaService));
    await controller.findAll(owner);
    const query = findMany.mock.calls[0][0];
    expect(query.where).toEqual({ firmMembers: { some: { firmId: 'firm-a' } } });
    expect(query.select).not.toHaveProperty('passwordHash');
    expect(query.select).not.toHaveProperty('lineLinkCode');
  });

  it('a user from another firm cannot be read or renamed', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const update = jest.fn();
    const controller = new UsersController(new UsersService({ user: { findFirst, update } } as unknown as PrismaService));
    await expect(controller.update(owner, 'user-of-firm-b', { firstName: 'x' })).rejects.toThrow('User not found');
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 'user-of-firm-b', firmMembers: { some: { firmId: 'firm-a' } } });
    expect(update).not.toHaveBeenCalled();
  });

  it('never deletes the global user', async () => {
    const del = jest.fn();
    const controller = new UsersController(new UsersService({ user: { delete: del } } as unknown as PrismaService));
    await expect(controller.remove()).rejects.toThrow('/saas/members');
    expect(del).not.toHaveBeenCalled();
  });

  it('lawyer list exposes no LINE link code or password hash', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await new UsersService({ user: { findMany } } as unknown as PrismaService).findLawyers('firm-a');
    const select = findMany.mock.calls[0][0].select;
    expect(select).not.toHaveProperty('lineLinkCode');
    expect(select).not.toHaveProperty('passwordHash');
  });
});
