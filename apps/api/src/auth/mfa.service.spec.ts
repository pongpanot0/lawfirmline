import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { MfaService } from './mfa.service';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';
import { MfaPurpose } from '../generated/prisma';

describe('MfaService', () => {
  let service: MfaService;
  const mockPrisma = {
    mfaCode: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    user: { update: jest.fn() },
  };
  const mockEmail = { sendMfaCodeEmail: jest.fn() };
  const mockJwt = { sign: jest.fn().mockReturnValue('mfa-jwt'), verify: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue('jwt-secret') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MfaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(MfaService);
  });

  describe('requestEnable / confirmEnable', () => {
    it('emails a 6-digit code and stores only its hash', async () => {
      await service.requestEnable('user-1', 'lawyer@example.test');

      expect(mockEmail.sendMfaCodeEmail).toHaveBeenCalledWith('lawyer@example.test', expect.stringMatching(/^\d{6}$/));
      const created = mockPrisma.mfaCode.create.mock.calls[0][0].data;
      expect(created.userId).toBe('user-1');
      expect(created.purpose).toBe(MfaPurpose.ENABLE);
      const sentCode = mockEmail.sendMfaCodeEmail.mock.calls[0][1];
      expect(created.codeHash).not.toBe(sentCode);
      expect(await bcrypt.compare(sentCode, created.codeHash)).toBe(true);
    });

    it('flips mfaEnabled only after the emailed code is confirmed', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrisma.mfaCode.findFirst.mockResolvedValue({
        id: 'code-1', userId: 'user-1', codeHash, attempts: 0, purpose: MfaPurpose.ENABLE,
      });

      await service.confirmEnable('user-1', '123456');

      expect(mockPrisma.mfaCode.update).toHaveBeenCalledWith({ where: { id: 'code-1' }, data: { usedAt: expect.any(Date) } });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { mfaEnabled: true } });
    });

    it('rejects the wrong code, counts the attempt, and never enables MFA', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrisma.mfaCode.findFirst.mockResolvedValue({
        id: 'code-1', userId: 'user-1', codeHash, attempts: 0, purpose: MfaPurpose.ENABLE,
      });

      await expect(service.confirmEnable('user-1', '000000')).rejects.toThrow(BadRequestException);

      expect(mockPrisma.mfaCode.update).toHaveBeenCalledWith({ where: { id: 'code-1' }, data: { attempts: { increment: 1 } } });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects when no unexpired, unused code exists for this purpose', async () => {
      mockPrisma.mfaCode.findFirst.mockResolvedValue(null);
      await expect(service.confirmEnable('user-1', '123456')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects once a code has already used its five attempts, even with the right code', async () => {
      const codeHash = await bcrypt.hash('123456', 10);
      mockPrisma.mfaCode.findFirst.mockResolvedValue({
        id: 'code-1', userId: 'user-1', codeHash, attempts: 5, purpose: MfaPurpose.ENABLE,
      });
      await expect(service.confirmEnable('user-1', '123456')).rejects.toThrow(BadRequestException);
    });
  });

  describe('disable', () => {
    it('turns mfaEnabled off', async () => {
      await service.disable('user-1');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { mfaEnabled: false } });
    });
  });

  describe('login challenge', () => {
    it('issues a LOGIN-purpose code and a scoped, short-lived token', async () => {
      const token = await service.requestLoginChallenge('user-1', 'lawyer@example.test');

      expect(token).toBe('mfa-jwt');
      expect(mockPrisma.mfaCode.create.mock.calls[0][0].data.purpose).toBe(MfaPurpose.LOGIN);
      expect(mockJwt.sign).toHaveBeenCalledWith(
        { sub: 'user-1', purpose: 'mfa-login' },
        expect.objectContaining({ expiresIn: '10m' }),
      );
    });

    it('reads back the userId from a valid token', () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', purpose: 'mfa-login' });
      expect(service.verifyMfaToken('mfa-jwt')).toBe('user-1');
    });

    it('rejects a token minted for a different purpose', () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', purpose: 'something-else' });
      expect(() => service.verifyMfaToken('mfa-jwt')).toThrow(UnauthorizedException);
    });

    it('rejects an invalid or expired token', () => {
      mockJwt.verify.mockImplementation(() => { throw new Error('expired'); });
      expect(() => service.verifyMfaToken('mfa-jwt')).toThrow(UnauthorizedException);
    });

    it('verifies a login code against the LOGIN-purpose record', async () => {
      const codeHash = await bcrypt.hash('654321', 10);
      mockPrisma.mfaCode.findFirst.mockResolvedValue({
        id: 'code-2', userId: 'user-1', codeHash, attempts: 0, purpose: MfaPurpose.LOGIN,
      });
      await service.verifyLoginCode('user-1', '654321');
      expect(mockPrisma.mfaCode.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ purpose: MfaPurpose.LOGIN }),
      }));
    });
  });
});
