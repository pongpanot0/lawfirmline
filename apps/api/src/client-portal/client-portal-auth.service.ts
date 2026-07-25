import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';

interface PortalTokenPayload {
  sub: string;
  clientId: string;
  firmId: string;
}

@Injectable()
export class ClientPortalAuthService {
  private readonly logger = new Logger(ClientPortalAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async requestLink(email: string): Promise<{ message: string; linkToken?: string }> {
    const message = 'If that email is registered for portal access, a sign-in link has been sent.';
    const contact = await this.prisma.clientContact.findFirst({
      where: { email, portalEnabled: true },
      include: { client: { include: { firm: true } } },
    });

    if (!contact) {
      return { message };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.clientPortalLoginToken.create({
      data: { clientContactId: contact.id, token, expiresAt },
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: contact.client.firmId,
        action: 'CLIENT_PORTAL_LINK_REQUESTED',
        metadata: { clientContactId: contact.id, email },
      },
    });

    const verifyUrl = `${this.email.getAppUrl()}/portal/verify?token=${token}`;
    try {
      await this.email.sendClientPortalMagicLinkEmail({
        to: contact.email!,
        contactName: contact.name,
        firmName: contact.client.firm.name,
        verifyUrl,
        expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send client portal magic link email to ${contact.email}: ${message}`);
    }

    const exposeDevToken = this.config.get<string>('CLIENT_PORTAL_EXPOSE_DEV_TOKEN') === 'true';
    return { message, linkToken: exposeDevToken ? token : undefined };
  }

  async verify(token: string): Promise<{
    accessToken: string;
    contact: { id: string; name: string; email: string | null };
    client: { id: string; name: string };
  }> {
    const claimed = await this.prisma.clientPortalLoginToken.updateMany({
      where: { token, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new BadRequestException('This sign-in link is invalid or has expired.');
    }

    const record = await this.prisma.clientPortalLoginToken.findUnique({ where: { token } });
    if (!record) {
      throw new BadRequestException('This sign-in link is invalid or has expired.');
    }

    const contact = await this.prisma.clientContact.findUnique({
      where: { id: record.clientContactId },
      include: { client: true },
    });
    if (!contact || !contact.portalEnabled) {
      throw new BadRequestException('Portal access is no longer available for this contact.');
    }

    try {
      await this.prisma.auditLog.create({
        data: {
          firmId: contact.client.firmId,
          action: 'CLIENT_PORTAL_LOGIN',
          metadata: { clientContactId: contact.id },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to write audit log for client portal login (contact ${contact.id}): ${message}`);
    }

    const payload: PortalTokenPayload = {
      sub: contact.id,
      clientId: contact.clientId,
      firmId: contact.client.firmId,
    };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('CLIENT_PORTAL_JWT_SECRET'),
      expiresIn: '7d',
    });

    return {
      accessToken,
      contact: { id: contact.id, name: contact.name, email: contact.email },
      client: { id: contact.client.id, name: contact.client.name },
    };
  }
}
