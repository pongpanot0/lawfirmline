import { UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';
import { ChangeAccountPasswordDto, UpdateAccountProfileDto } from './dto/account.dto';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import type { AuthUser } from '@lawfirm/shared';

describe('Account self-service', () => {
  const prisma = {
    user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    session: { updateMany: jest.fn() },
    auditLog: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  };
  const tenant = { buildAuthUser: jest.fn() };
  const service = new AccountService(prisma as unknown as PrismaService, tenant as unknown as TenantService);
  const controller = new AccountController(service);
  const user = { id: 'self', firmId: 'firm-a' } as AuthUser;
  let hash: string;

  beforeAll(async () => { hash = await bcrypt.hash('current-secret', 4); });
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({ passwordHash: hash });
    prisma.$transaction.mockImplementation(async callback => callback(prisma));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    prisma.auditLog.findFirst.mockResolvedValue(null);
  });

  it('uses authenticated identity and only names even with forged identity and role fields', async () => {
    const body = { firstName: 'New', lastName: 'Name', id: 'victim', firmId: 'firm-b', role: 'ADMIN', email: 'attacker@test.invalid' };
    tenant.buildAuthUser.mockResolvedValue({ ...user, firstName: 'New' });
    await controller.updateProfile(user, body as UpdateAccountProfileDto);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'self' }, data: { firstName: 'New', lastName: 'Name' }, select: { id: true } });
    expect(tenant.buildAuthUser).toHaveBeenCalledWith('self', 'firm-a');
  });

  it('rejects wrong current password before changing credentials or sessions', async () => {
    await expect(service.changePassword('self', 'wrong', 'new-secret')).rejects.toThrow(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('hashes the new password and revokes all refresh sessions only for this user', async () => {
    await service.changePassword('self', 'current-secret', 'new-secret');
    const update = prisma.user.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'self', passwordHash: hash });
    expect(await bcrypt.compare('new-secret', update.data.passwordHash)).toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledWith({ where: { userId: 'self', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
  });

  it('rejects a concurrent reset instead of replacing the newer password', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.changePassword('self', 'current-secret', 'new-secret')).rejects.toThrow(UnauthorizedException);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it('reauthenticates even when a deletion request already exists', async () => {
    await expect(service.requestDeletion('self', 'firm-a', 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(prisma.auditLog.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('records a global personal-data request and never reports completed deletion', async () => {
    const createdAt = new Date('2026-10-04T00:00:00Z');
    prisma.auditLog.create.mockResolvedValue({ id: 'receipt', createdAt });
    expect(await controller.requestDeletion(user, { currentPassword: 'current-secret' })).toEqual({ id: 'receipt', requestedAt: createdAt, status: 'PENDING_REVIEW' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: { userId: 'self', firmId: 'firm-a', action: 'ACCOUNT_DELETION_REQUESTED', metadata: { scope: 'GLOBAL_ACCOUNT_AND_ASSOCIATED_PERSONAL_DATA', status: 'PENDING_REVIEW' } }, select: { id: true, createdAt: true } });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns the same request when called from another firm of the same user', async () => {
    prisma.auditLog.findFirst.mockResolvedValue({ id: 'existing', createdAt: new Date() });
    expect((await service.requestDeletion('self', 'firm-b', 'current-secret')).id).toBe('existing');
    expect(prisma.auditLog.findFirst.mock.calls[0][0].where).toEqual({ userId: 'self', action: 'ACCOUNT_DELETION_REQUESTED' });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('validates character minimum and UTF-8 bcrypt byte limit', async () => {
    const valid = plainToInstance(ChangeAccountPasswordDto, { currentPassword: 'old', password: 'ก'.repeat(24) });
    expect(await validate(valid)).toHaveLength(0);
    for (const password of ['ก'.repeat(3), 'ก'.repeat(25), 'a'.repeat(73)]) {
      expect((await validate(plainToInstance(ChangeAccountPasswordDto, { currentPassword: 'old', password }))).length).toBeGreaterThan(0);
    }
  });
});
