import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.module';

interface PortalJwtPayload {
  sub: string;
  clientId: string;
  firmId: string;
}

export interface PortalIdentity {
  clientContactId: string;
  clientId: string;
  firmId: string;
  name: string;
  email: string | null;
}

@Injectable()
export class ClientPortalJwtStrategy extends PassportStrategy(Strategy, 'client-portal-jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: config.get<string>('CLIENT_PORTAL_JWT_SECRET') ?? 'dev-client-portal-secret',
    });
  }

  async validate(req: Request, payload: PortalJwtPayload): Promise<PortalIdentity> {
    const contact = await this.prisma.clientContact.findUnique({
      where: { id: payload.sub },
      include: { client: { select: { firmId: true } } },
    });
    // The firm comes from the database, never from the token: writes made as
    // this contact (uploads, messages, audit rows) must land in its own firm.
    if (!contact || !contact.portalEnabled || contact.clientId !== payload.clientId || contact.client.firmId !== payload.firmId) {
      throw new UnauthorizedException();
    }

    await this.prisma.auditLog.create({
      data: {
        firmId: contact.client.firmId,
        action: 'CLIENT_PORTAL_ACCESS',
        metadata: { clientContactId: contact.id, path: req.originalUrl },
      },
    });

    return {
      clientContactId: contact.id,
      clientId: contact.clientId,
      firmId: contact.client.firmId,
      name: contact.name,
      email: contact.email,
    };
  }
}
