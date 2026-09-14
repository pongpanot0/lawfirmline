import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import { PrismaService } from '../prisma/prisma.module';

describe('SessionService', () => {
  let service: SessionService;
  const mockPrisma = {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(SessionService);
  });

  describe('touch', () => {
    it('returns false for an unknown jti', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);
      expect(await service.touch('missing')).toBe(false);
      expect(mockPrisma.session.update).not.toHaveBeenCalled();
    });

    it('returns false for a revoked session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        jti: 'jti-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await service.touch('jti-1')).toBe(false);
    });

    it('returns false for an expired session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        jti: 'jti-1', revokedAt: null, expiresAt: new Date(Date.now() - 60_000),
      });
      expect(await service.touch('jti-1')).toBe(false);
    });

    it('bumps lastUsedAt and returns true for a live session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        jti: 'jti-1', revokedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      expect(await service.touch('jti-1')).toBe(true);
      expect(mockPrisma.session.update).toHaveBeenCalledWith({ where: { jti: 'jti-1' }, data: { lastUsedAt: expect.any(Date) } });
    });
  });

  describe('revokeAll', () => {
    it('excludes the caller’s own jti when given one', async () => {
      await service.revokeAll('user-1', 'jti-mine');
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null, jti: { not: 'jti-mine' } },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('revokes every session when no exception is given', async () => {
      await service.revokeAll('user-1');
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revoke', () => {
    it('scopes the update to the owning user, so one user cannot revoke another’s session', async () => {
      await service.revoke('user-1', 'session-9');
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-9', userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
