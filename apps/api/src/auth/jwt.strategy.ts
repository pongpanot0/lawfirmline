import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { TenantService } from '../saas/tenant.service';

interface JwtPayload {
  sub: string;
  email: string;
  firmId: string;
  firmRole: FirmRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private tenant: TenantService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const authUser = await this.tenant.buildAuthUser(payload.sub, payload.firmId);
    if (!authUser) {
      throw new UnauthorizedException();
    }
    return authUser;
  }
}
