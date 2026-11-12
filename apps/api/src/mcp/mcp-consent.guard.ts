import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ExtractJwt } from 'passport-jwt';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

export interface McpConsentRequest extends Request { mcpSessionJti: string }

@Injectable()
export class McpConsentGuard extends JwtAuthGuard {
  constructor(reflector: Reflector, private readonly jwt: JwtService) { super(reflector); }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) return false;
    const req = context.switchToHttp().getRequest<McpConsentRequest>();
    // Decode only after the normal guard verifies this bearer token's signature and expiry.
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const payload = token ? this.jwt.decode(token) : null;
    if (!payload || typeof payload === 'string' || typeof payload.jti !== 'string' || !payload.jti) {
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบอีกครั้งก่อนเชื่อมต่อ AI');
    }
    req.mcpSessionJti = payload.jti;
    return true;
  }
}
