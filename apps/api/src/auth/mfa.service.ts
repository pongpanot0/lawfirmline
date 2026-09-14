import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { MfaPurpose } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MFA_TOKEN_PURPOSE = 'mfa-login';

/**
 * Email one-time-code MFA. A code is never trusted on its own: it is hashed
 * at rest, capped at five guesses, expires in ten minutes, and single-use.
 * Enabling MFA requires proving control of the inbox first — nothing flips
 * `user.mfaEnabled` without a confirmed code.
 */
@Injectable()
export class MfaService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  private generateCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async issueCode(userId: string, purpose: MfaPurpose): Promise<string> {
    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    await this.prisma.mfaCode.create({
      data: { userId, codeHash, purpose, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
    });
    return code;
  }

  private async verifyCode(userId: string, purpose: MfaPurpose, code: string): Promise<void> {
    const record = await this.prisma.mfaCode.findFirst({
      where: { userId, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('รหัสหมดอายุหรือพยายามผิดเกินกำหนด กรุณาขอรหัสใหม่ / Code expired or too many attempts — request a new one');
    }
    const valid = await bcrypt.compare(code, record.codeHash);
    if (!valid) {
      await this.prisma.mfaCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('รหัสไม่ถูกต้อง / Incorrect code');
    }
    await this.prisma.mfaCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  }

  async requestEnable(userId: string, email: string): Promise<void> {
    const code = await this.issueCode(userId, MfaPurpose.ENABLE);
    await this.email.sendMfaCodeEmail(email, code);
  }

  async confirmEnable(userId: string, code: string): Promise<void> {
    await this.verifyCode(userId, MfaPurpose.ENABLE, code);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } });
  }

  /** Issues the login-time code and a short-lived token identifying who it belongs to. */
  async requestLoginChallenge(userId: string, email: string): Promise<string> {
    const code = await this.issueCode(userId, MfaPurpose.LOGIN);
    await this.email.sendMfaCodeEmail(email, code);
    return this.jwt.sign(
      { sub: userId, purpose: MFA_TOKEN_PURPOSE },
      { secret: this.config.get<string>('JWT_SECRET'), expiresIn: '10m' },
    );
  }

  /** @returns the userId the challenge was issued for. */
  verifyMfaToken(token: string): string {
    try {
      const payload = this.jwt.verify(token, { secret: this.config.get<string>('JWT_SECRET') }) as {
        sub: string;
        purpose: string;
      };
      if (payload.purpose !== MFA_TOKEN_PURPOSE) throw new Error('wrong purpose');
      return payload.sub;
    } catch {
      throw new UnauthorizedException('เซสชันยืนยันตัวตนหมดอายุ กรุณาเข้าสู่ระบบใหม่ / MFA session expired, sign in again');
    }
  }

  async verifyLoginCode(userId: string, code: string): Promise<void> {
    await this.verifyCode(userId, MfaPurpose.LOGIN, code);
  }
}
