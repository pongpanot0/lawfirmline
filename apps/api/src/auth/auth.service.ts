import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { AuthUser, LoginResponse, LoginResult, DEFAULT_ROOT_DOMAIN } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import { SaasAuthService } from '../saas/saas-auth.service';
import { RegisterDto } from './dto/register.dto';
import { MfaService } from './mfa.service';
import { SessionService, SessionInfo } from './session.service';

interface JwtPayload {
  sub: string;
  firmId: string;
  jti?: string;
}

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

/** Parses a JWT-style duration ("7d", "15m", "1h", "30s") into an absolute expiry Date. */
function expiresInToDate(expiresIn: string): Date {
  const match = /^(\d+)([smhd])$/.exec(expiresIn);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = match ? Number(match[1]) * unitMs[match[2]] : 7 * 86_400_000;
  return new Date(Date.now() + ms);
}

/** Lets the apex domain silently mint a session for the firm subdomain, without a second login. */
const REFRESH_COOKIE_NAME = 'samnuan_rt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private saasAuth: SaasAuthService,
    private jwt: JwtService,
    private config: ConfigService,
    private mfa: MfaService,
    private sessions: SessionService,
  ) {}

  async login(dto: LoginDto, firmId?: string, meta?: RequestMeta): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.mfaEnabled) {
      const mfaToken = await this.mfa.requestLoginChallenge(user.id, user.email);
      return { mfaRequired: true, mfaToken };
    }

    const authUser = await this.tenant.buildAuthUser(user.id, firmId);
    if (!authUser) {
      throw new UnauthorizedException(
        firmId ? 'No membership for this firm' : 'No firm membership found',
      );
    }

    return this.loginFromAuthUser(authUser, meta);
  }

  async verifyMfaLogin(mfaToken: string, code: string, firmId?: string, meta?: RequestMeta): Promise<LoginResponse> {
    const userId = this.mfa.verifyMfaToken(mfaToken);
    await this.mfa.verifyLoginCode(userId, code);

    const authUser = await this.tenant.buildAuthUser(userId, firmId);
    if (!authUser) {
      throw new UnauthorizedException(
        firmId ? 'No membership for this firm' : 'No firm membership found',
      );
    }

    return this.loginFromAuthUser(authUser, meta);
  }

  async requestEnableMfa(userId: string, email: string): Promise<{ message: string }> {
    await this.mfa.requestEnable(userId, email);
    return { message: 'Verification code sent' };
  }

  async confirmEnableMfa(userId: string, code: string): Promise<{ success: boolean }> {
    await this.mfa.confirmEnable(userId, code);
    return { success: true };
  }

  async disableMfa(userId: string, password: string): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid password');
    }
    await this.mfa.disable(userId);
    return { success: true };
  }

  async register(dto: RegisterDto, tenantFirmId?: string | null, meta?: RequestMeta): Promise<LoginResponse> {
    if (tenantFirmId) {
      throw new BadRequestException('Register from the main site, not a firm subdomain');
    }
    const authUser = await this.saasAuth.register(dto);
    return {
      accessToken: this.signAccessToken(authUser),
      refreshToken: await this.signRefreshToken(authUser, meta),
      user: authUser,
    };
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const result = await this.saasAuth.createPasswordResetToken(email);
    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    return {
      message: 'If that email exists, a reset link has been sent.',
      resetToken: isDev && result ? result.token : undefined,
    };
  }

  async resetPassword(token: string, password: string): Promise<{ success: boolean }> {
    await this.saasAuth.resetPassword(token, password);
    return { success: true };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      }) as JwtPayload;
      if (!payload.jti || !(await this.sessions.touch(payload.jti))) {
        throw new UnauthorizedException();
      }
      const authUser = await this.tenant.buildAuthUser(payload.sub, payload.firmId);
      if (!authUser) throw new UnauthorizedException();
      return { accessToken: this.signAccessToken(authUser) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Apex has no localStorage session of its own (tokens live on the firm subdomain).
   * A refresh token in the cross-subdomain cookie lets it mint one without asking
   * the user to type their password again, then hand off exactly like a fresh login.
   */
  async sessionFromCookie(refreshToken: string): Promise<LoginResponse> {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      }) as JwtPayload;
      if (!payload.jti || !(await this.sessions.touch(payload.jti))) {
        throw new UnauthorizedException();
      }
      const authUser = await this.tenant.buildAuthUser(payload.sub, payload.firmId);
      if (!authUser) throw new UnauthorizedException();
      return { accessToken: this.signAccessToken(authUser), refreshToken, user: authUser };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  readRefreshCookie(req: Request): string | null {
    const header = req.headers.cookie;
    if (!header) return null;
    const entry = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${REFRESH_COOKIE_NAME}=`));
    return entry ? decodeURIComponent(entry.slice(REFRESH_COOKIE_NAME.length + 1)) : null;
  }

  setRefreshCookie(res: Response, refreshToken: string): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const rootDomain = this.config.get<string>('ROOT_DOMAIN') ?? DEFAULT_ROOT_DOMAIN;
    const expiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      domain: isProd ? `.${rootDomain}` : undefined,
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: expiresInToDate(expiresIn).getTime() - Date.now(),
    });
  }

  clearRefreshCookie(res: Response): void {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const rootDomain = this.config.get<string>('ROOT_DOMAIN') ?? DEFAULT_ROOT_DOMAIN;
    res.clearCookie(REFRESH_COOKIE_NAME, { domain: isProd ? `.${rootDomain}` : undefined, path: '/' });
  }

  /** Revokes the session tied to this refresh token, so it can no longer mint access tokens. */
  async logout(refreshToken: string): Promise<{ success: boolean }> {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        ignoreExpiration: true,
      }) as JwtPayload;
      if (payload.jti) await this.sessions.revokeByJti(payload.jti);
    } catch {
      // Malformed/foreign token — nothing to revoke, and logout should never fail client-side.
    }
    return { success: true };
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    return this.sessions.list(userId);
  }

  async revokeSession(userId: string, sessionId: string): Promise<{ success: boolean }> {
    await this.sessions.revoke(userId, sessionId);
    return { success: true };
  }

  /** "Log out of all other devices" — keeps the caller's own current session (identified by its refresh token) alive. */
  async revokeOtherSessions(userId: string, currentRefreshToken?: string): Promise<{ success: boolean }> {
    let exceptJti: string | undefined;
    if (currentRefreshToken) {
      try {
        const payload = this.jwt.verify(currentRefreshToken, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        }) as JwtPayload;
        exceptJti = payload.jti;
      } catch {
        // Ignore — falls through to revoking everything.
      }
    }
    await this.sessions.revokeAll(userId, exceptJti);
    return { success: true };
  }

  async getMe(userId: string, firmId?: string): Promise<AuthUser> {
    const authUser = await this.tenant.buildAuthUser(userId, firmId);
    if (!authUser) throw new UnauthorizedException();
    return authUser;
  }

  async loginFromAuthUser(authUser: AuthUser, meta?: RequestMeta): Promise<LoginResponse> {
    await this.prisma.auditLog.create({
      data: {
        firmId: authUser.firmId,
        userId: authUser.id,
        action: 'USER_LOGIN',
        metadata: { ip: meta?.ip ?? null, userAgent: meta?.userAgent ?? null },
      },
    });
    return {
      accessToken: this.signAccessToken(authUser),
      refreshToken: await this.signRefreshToken(authUser, meta),
      user: authUser,
    };
  }

  private signAccessToken(user: AuthUser): string {
    return this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        firmId: user.firmId,
        firmRole: user.firmRole,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: (this.config.get<string>('JWT_EXPIRES_IN') ?? '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );
  }

  private async signRefreshToken(user: AuthUser, meta?: RequestMeta): Promise<string> {
    const expiresIn = (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`;
    const jti = await this.sessions.issue(user.id, expiresInToDate(expiresIn), meta);
    return this.jwt.sign(
      { sub: user.id, firmId: user.firmId, jti },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn,
      },
    );
  }
}
