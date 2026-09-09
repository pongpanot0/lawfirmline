import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OutlookConnectionsService } from './outlook-connections.service';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookOAuthService } from './outlook-oauth.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { encryptToken } from '../common/utils/token-encryption.util';

describe('OutlookConnectionsService', () => {
  let service: OutlookConnectionsService;
  const mockPrisma = {
    mailboxConnection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  };
  const mockOAuth = { refreshTokens: jest.fn() };
  const mockGraph = { deleteSubscription: jest.fn() };

  beforeAll(() => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = 'b'.repeat(64);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookConnectionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookOAuthService, useValue: mockOAuth },
        { provide: OutlookGraphClient, useValue: mockGraph },
      ],
    }).compile();
    service = module.get(OutlookConnectionsService);
  });

  describe('getValidAccessToken', () => {
    it('returns the decrypted token directly when it is not close to expiring', async () => {
      const accessToken = encryptToken('valid-access-token');
      mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({
        id: 'conn-1',
        accessTokenEnc: accessToken,
        refreshTokenEnc: encryptToken('refresh'),
        tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
      });

      const token = await service.getValidAccessToken('conn-1');

      expect(token).toBe('valid-access-token');
      expect(mockOAuth.refreshTokens).not.toHaveBeenCalled();
    });

    it('refreshes the token when it is expiring within 5 minutes', async () => {
      mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({
        id: 'conn-1',
        accessTokenEnc: encryptToken('stale-token'),
        refreshTokenEnc: encryptToken('refresh-token'),
        tokenExpiresAt: new Date(Date.now() + 60_000),
      });
      mockOAuth.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      });

      const token = await service.getValidAccessToken('conn-1');

      expect(token).toBe('new-access-token');
      expect(mockOAuth.refreshTokens).toHaveBeenCalledWith('refresh-token');
      expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'conn-1' } }),
      );
    });

    it('marks the connection EXPIRED and throws when refresh fails (revoked consent)', async () => {
      mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({
        id: 'conn-1',
        accessTokenEnc: encryptToken('stale-token'),
        refreshTokenEnc: encryptToken('refresh-token'),
        tokenExpiresAt: new Date(Date.now() + 60_000),
      });
      mockOAuth.refreshTokens.mockRejectedValue(new Error('invalid_grant'));

      await expect(service.getValidAccessToken('conn-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }),
      );
    });
  });

  describe('disconnect', () => {
    it('throws 404 for a connection belonging to a different firm', async () => {
      mockPrisma.mailboxConnection.findFirst.mockResolvedValue(null);
      await expect(service.disconnect('firm-1', 'conn-999')).rejects.toThrow(NotFoundException);
    });

    it('wipes tokens and marks REVOKED rather than deleting the row (audit trail)', async () => {
      mockPrisma.mailboxConnection.findFirst.mockResolvedValue({
        id: 'conn-1',
        firmId: 'firm-1',
        graphSubscriptionId: null,
      });

      await service.disconnect('firm-1', 'conn-1');

      expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          status: 'REVOKED',
          accessTokenEnc: '',
          refreshTokenEnc: '',
        }),
      });
    });
  });

  describe('assertOwnership', () => {
    it('throws 404 when the connection is not in this firm', async () => {
      mockPrisma.mailboxConnection.findFirst.mockResolvedValue(null);
      await expect(service.assertOwnership('firm-1', 'conn-other-firm')).rejects.toThrow(NotFoundException);
    });

    it('resolves when the connection belongs to this firm', async () => {
      mockPrisma.mailboxConnection.findFirst.mockResolvedValue({ id: 'conn-1', firmId: 'firm-1' });
      await expect(service.assertOwnership('firm-1', 'conn-1')).resolves.toBeUndefined();
    });
  });
});
