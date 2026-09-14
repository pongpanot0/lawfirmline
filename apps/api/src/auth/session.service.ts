import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.module';

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
}

@Injectable()
export class SessionService {
  constructor(private prisma: PrismaService) {}

  /** Called whenever a refresh token is signed — the jti it embeds becomes this row's identity. */
  async issue(userId: string, expiresAt: Date, meta?: { userAgent?: string; ip?: string }): Promise<string> {
    const jti = crypto.randomUUID();
    await this.prisma.session.create({
      data: { userId, jti, expiresAt, userAgent: meta?.userAgent, ip: meta?.ip },
    });
    return jti;
  }

  /** Validates a refresh token's jti and bumps lastUsedAt. Returns false if revoked, expired, or unknown. */
  async touch(jti: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({ where: { jti } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return false;
    await this.prisma.session.update({ where: { jti }, data: { lastUsedAt: new Date() } });
    return true;
  }

  async revokeByJti(jti: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { jti, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revoke(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(userId: string, exceptJti?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptJti ? { jti: { not: exceptJti } } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  async list(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
    }));
  }
}
