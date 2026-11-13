import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { TenantService } from '../saas/tenant.service';
import { SessionService } from './session.service';

interface JwtPayload {
  sub: string;
  /** The refresh session this access token was minted from. */
  jti?: string;
  email: string;
  firmId: string;
  firmRole: FirmRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private tenant: TenantService,
    private sessions: SessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // Without this, a logged-out (or revoked) session's access token kept working until it
    // expired — and a copy left in another subdomain's storage signed the user straight back in.
    if (payload.jti && !(await this.sessions.isActive(payload.jti))) {
      throw new UnauthorizedException();
    }
    const authUser = await this.tenant.buildAuthUser(payload.sub, payload.firmId);
    if (!authUser) {
      throw new UnauthorizedException();
    }
    return authUser;
  }
}
