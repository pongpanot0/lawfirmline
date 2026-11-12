import { AuthUser, FirmRole } from '@lawfirm/shared';
import { TenantService } from '../saas/tenant.service';
import { PrismaService } from '../prisma/prisma.module';

describe('member removal revokes MCP', () => {
  it('revokes only the removed member in that firm inside the removal transaction', async () => {
    const tx = { firmMember: { delete: jest.fn() }, mcpConnection: { updateMany: jest.fn() }, auditLog: { create: jest.fn() } };
    const prisma = { firmMember: { findUnique: jest.fn().mockResolvedValue({ role: 'LAWYER' }) }, $transaction: jest.fn(async cb => cb(tx)) };
    const tenant = new TenantService(prisma as unknown as PrismaService);
    await tenant.removeMember({ id: 'owner', firmId: 'firm', firmRole: FirmRole.OWNER } as AuthUser, 'removed');
    expect(tx.mcpConnection.updateMany).toHaveBeenCalledWith({ where: { firmId: 'firm', userId: 'removed', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it('revokes connections when a member becomes EXTERNAL so promotion cannot revive old tokens', async () => {
    const tx = { firmMember: { update: jest.fn() }, mcpConnection: { updateMany: jest.fn() }, auditLog: { create: jest.fn() } };
    const prisma = { firmMember: { findUnique: jest.fn().mockResolvedValue({ role: 'LAWYER' }) }, $transaction: jest.fn(async cb => cb(tx)) };
    const tenant = new TenantService(prisma as unknown as PrismaService);
    await tenant.updateMemberRole({ id: 'owner', firmId: 'firm', firmRole: FirmRole.OWNER } as AuthUser, 'member', FirmRole.EXTERNAL);
    expect(tx.mcpConnection.updateMany).toHaveBeenCalledWith({ where: { firmId: 'firm', userId: 'member', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

});
