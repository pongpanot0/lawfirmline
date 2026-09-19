import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { FirmRole } from '@lawfirm/shared';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import { SaasAuthService } from '../saas/saas-auth.service';
import { MfaService } from './mfa.service';
import { SessionService } from './session.service';

describe('AuthService', () => {
  let service: AuthService;
  const mockPrisma = { user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() }, auditLog: { create: jest.fn() } };
  const mockTenant = { buildAuthUser: jest.fn() };
  const mockSaasAuth = {};
  const mockJwt = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const mockMfa = {
    requestLoginChallenge: jest.fn(),
    verifyMfaToken: jest.fn(),
    verifyLoginCode: jest.fn(),
    requestEnable: jest.fn(),
    confirmEnable: jest.fn(),
    disable: jest.fn(),
  };
  const mockSessions = {
    issue: jest.fn().mockResolvedValue('jti-1'),
    touch: jest.fn().mockResolvedValue(true),
    revokeByJti: jest.fn(),
    revoke: jest.fn(),
    revokeAll: jest.fn(),
    list: jest.fn(),
  };

  const authUser = {
    id: 'user-1', email: 'lawyer@example.test', firstName: 'A', lastName: 'B',
    firmId: 'firm-1', firmSlug: 'firm', firmName: 'Firm', firmRole: FirmRole.LAWYER,
    subscriptionStatus: 'TRIAL', subscriptionPlan: null, trialEndAt: null,
    currentPeriodEnd: null, maxUsers: 5, mfaEnabled: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TenantService, useValue: mockTenant },
        { provide: SaasAuthService, useValue: mockSaasAuth },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MfaService, useValue: mockMfa },
        { provide: SessionService, useValue: mockSessions },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  describe('login', () => {
    it('returns tokens directly when the account has no MFA', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'lawyer@example.test', passwordHash, mfaEnabled: false });
      mockTenant.buildAuthUser.mockResolvedValue(authUser);

      const result = await service.login({ email: 'lawyer@example.test', password: 'correct-horse' });

      expect(result).toEqual(expect.objectContaining({ accessToken: 'signed-token', refreshToken: 'signed-token', user: authUser }));
      expect(mockMfa.requestLoginChallenge).not.toHaveBeenCalled();
    });

    it('issues an MFA challenge instead of tokens when the account has MFA on — no token leaks before the code is checked', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'lawyer@example.test', passwordHash, mfaEnabled: true });
      mockMfa.requestLoginChallenge.mockResolvedValue('mfa-token');

      const result = await service.login({ email: 'lawyer@example.test', password: 'correct-horse' });

      expect(result).toEqual({ mfaRequired: true, mfaToken: 'mfa-token' });
      expect(mockMfa.requestLoginChallenge).toHaveBeenCalledWith('user-1', 'lawyer@example.test');
      expect(mockTenant.buildAuthUser).not.toHaveBeenCalled();
    });

    it('rejects a wrong password before ever consulting MFA', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', passwordHash, mfaEnabled: true });

      await expect(service.login({ email: 'lawyer@example.test', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
      expect(mockMfa.requestLoginChallenge).not.toHaveBeenCalled();
    });
  });

  describe('verifyMfaLogin', () => {
    it('checks the token, then the code, then issues real tokens', async () => {
      mockMfa.verifyMfaToken.mockReturnValue('user-1');
      mockTenant.buildAuthUser.mockResolvedValue(authUser);

      const result = await service.verifyMfaLogin('mfa-token', '123456');

      expect(mockMfa.verifyMfaToken).toHaveBeenCalledWith('mfa-token');
      expect(mockMfa.verifyLoginCode).toHaveBeenCalledWith('user-1', '123456');
      expect(result).toEqual(expect.objectContaining({ accessToken: 'signed-token', user: authUser }));
    });

    it('never reaches account lookup when the code is wrong', async () => {
      mockMfa.verifyMfaToken.mockReturnValue('user-1');
      mockMfa.verifyLoginCode.mockRejectedValue(new Error('bad code'));

      await expect(service.verifyMfaLogin('mfa-token', '000000')).rejects.toThrow('bad code');
      expect(mockTenant.buildAuthUser).not.toHaveBeenCalled();
    });
  });

  describe('disableMfa', () => {
    it('requires the correct current password', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });

      await expect(service.disableMfa('user-1', 'wrong')).rejects.toThrow(UnauthorizedException);
      expect(mockMfa.disable).not.toHaveBeenCalled();
    });

    it('disables MFA once the password checks out', async () => {
      const passwordHash = await bcrypt.hash('correct-horse', 10);
      mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', passwordHash });

      const result = await service.disableMfa('user-1', 'correct-horse');

      expect(mockMfa.disable).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('refresh', () => {
    it('rejects a well-formed refresh token whose session was revoked', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', firmId: 'firm-1', jti: 'jti-1' });
      mockSessions.touch.mockResolvedValue(false);

      await expect(service.refresh('refresh-token')).rejects.toThrow(UnauthorizedException);
      expect(mockTenant.buildAuthUser).not.toHaveBeenCalled();
    });

    it('mints a new access token when the session is still live', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', firmId: 'firm-1', jti: 'jti-1' });
      mockSessions.touch.mockResolvedValue(true);
      mockTenant.buildAuthUser.mockResolvedValue(authUser);

      const result = await service.refresh('refresh-token');

      expect(mockSessions.touch).toHaveBeenCalledWith('jti-1');
      expect(result).toEqual({ accessToken: 'signed-token' });
    });
  });

  describe('logout', () => {
    it('revokes the session tied to the refresh token', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', firmId: 'firm-1', jti: 'jti-1' });

      const result = await service.logout('refresh-token');

      expect(mockSessions.revokeByJti).toHaveBeenCalledWith('jti-1');
      expect(result).toEqual({ success: true });
    });

    it('never throws, even for a garbage token', async () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('bad token'); });

      const result = await service.logout('garbage');

      expect(mockSessions.revokeByJti).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('revokeOtherSessions', () => {
    it('keeps the caller’s own session alive while revoking the rest', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', firmId: 'firm-1', jti: 'jti-current' });

      await service.revokeOtherSessions('user-1', 'refresh-token');

      expect(mockSessions.revokeAll).toHaveBeenCalledWith('user-1', 'jti-current');
    });
  });
});
