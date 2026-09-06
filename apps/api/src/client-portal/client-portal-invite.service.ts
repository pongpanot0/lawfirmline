import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';

interface PortalTokenPayload {
  sub: string;
  clientId: string;
  firmId: string;
}

@Injectable()
export class ClientPortalInviteService {
  private readonly logger = new Logger(ClientPortalInviteService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private email: EmailService,
  ) {}

  async createInvite(user: AuthUser, clientContactId: string) {
    const contact = await this.prisma.clientContact.findFirst({
      where: { id: clientContactId, client: { firmId: user.firmId } },
      include: { client: { include: { firm: true } } },
    });
    if (!contact) throw new NotFoundException('Contact not found');
    if (!contact.email) {
      throw new BadRequestException('This contact has no email address on file');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.clientPortalInvite.create({
      data: { clientContactId: contact.id, token, expiresAt, invitedById: user.id },
    });

    const inviteUrl = `${this.email.getAppUrl()}/portal/invite/${token}`;
    try {
      await this.email.sendClientPortalInviteEmail({
        to: contact.email,
        contactName: contact.name,
        clientName: contact.client.name,
        firmName: contact.client.firm.name,
        inviteUrl,
        expiresAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send client portal invite email to contact ${contact.id}: ${message}`);
    }

    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'CLIENT_PORTAL_INVITE_SENT',
        metadata: { clientContactId: contact.id, inviteId: invite.id },
      },
    });

    return { id: invite.id, expiresAt: invite.expiresAt };
  }

  async getInvite(token: string) {
    const invite = await this.prisma.clientPortalInvite.findUnique({
      where: { token },
      include: { clientContact: { include: { client: true } } },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('This invitation is invalid or has expired.');
    }

    return {
      contactName: invite.clientContact.name,
      contactEmail: invite.clientContact.email,
      clientName: invite.clientContact.client.name,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptInvite(token: string): Promise<{
    accessToken: string;
    contact: { id: string; name: string; email: string | null };
    client: { id: string; name: string };
  }> {
    const invite = await this.prisma.clientPortalInvite.findUnique({
      where: { token },
      include: { clientContact: { include: { client: true } } },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      throw new BadRequestException('This invitation is invalid or has expired.');
    }

    const contact = await this.prisma.clientContact.update({
      where: { id: invite.clientContactId },
      data: { portalEnabled: true },
      include: { client: true },
    });

    await this.prisma.clientPortalInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        firmId: contact.client.firmId,
        action: 'CLIENT_PORTAL_INVITE_ACCEPTED',
        metadata: { clientContactId: contact.id, inviteId: invite.id },
      },
    });

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
