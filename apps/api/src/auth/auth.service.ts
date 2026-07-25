import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { AuthUser, LoginResponse } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { TenantService } from '../saas/tenant.service';
import { SaasAuthService } from '../saas/saas-auth.service';
import { RegisterDto } from './dto/register.dto';

interface JwtPayload {
  sub: string;
  firmId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private tenant: TenantService,
    private saasAuth: SaasAuthService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const authUser = await this.tenant.buildAuthUser(user.id);
    if (!authUser) {
      throw new UnauthorizedException('No firm membership found');
    }

    return {
      accessToken: this.signAccessToken(authUser),
      refreshToken: this.signRefreshToken(authUser),
      user: authUser,
    };
  }

  async register(dto: RegisterDto): Promise<LoginResponse> {
    const authUser = await this.saasAuth.register(dto);
    return {
      accessToken: this.signAccessToken(authUser),
      refreshToken: this.signRefreshToken(authUser),
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
      const authUser = await this.tenant.buildAuthUser(payload.sub, payload.firmId);
      if (!authUser) throw new UnauthorizedException();
      return { accessToken: this.signAccessToken(authUser) };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getMe(userId: string, firmId?: string): Promise<AuthUser> {
    const authUser = await this.tenant.buildAuthUser(userId, firmId);
    if (!authUser) throw new UnauthorizedException();
    return authUser;
  }

  loginFromAuthUser(authUser: AuthUser): LoginResponse {
    return {
      accessToken: this.signAccessToken(authUser),
      refreshToken: this.signRefreshToken(authUser),
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

  private signRefreshToken(user: AuthUser): string {
    return this.jwt.sign(
      { sub: user.id, firmId: user.firmId },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as `${number}${'s' | 'm' | 'h' | 'd'}`,
      },
    );
  }
}
