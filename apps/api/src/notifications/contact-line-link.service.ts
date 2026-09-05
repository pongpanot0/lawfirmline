import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.module';
import { LineLinkService } from './line-link.service';

const LINK_CODE_TTL_MS = 15 * 60 * 1000;
const LINK_CODE_PATTERN = /^LF-[A-Z0-9]{6}$/i;

@Injectable()
export class ContactLineLinkService {
  private readonly logger = new Logger(ContactLineLinkService.name);

  constructor(
    private prisma: PrismaService,
    private lineLink: LineLinkService,
  ) {}

  async getPersonalStatus(clientContactId: string) {
    const contact = await this.prisma.clientContact.findUnique({
      where: { id: clientContactId },
      select: {
        lineUserId: true,
        lineConnectedAt: true,
        lineLinkCode: true,
        lineLinkCodeExpiresAt: true,
      },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    const pendingLink =
      contact.lineLinkCode &&
      contact.lineLinkCodeExpiresAt &&
      contact.lineLinkCodeExpiresAt.getTime() > Date.now();

    return {
      connected: Boolean(contact.lineUserId),
      connectedAt: contact.lineConnectedAt?.toISOString() ?? null,
      pendingLinkCode: pendingLink ? contact.lineLinkCode : null,
      pendingLinkExpiresAt: pendingLink
        ? contact.lineLinkCodeExpiresAt!.toISOString()
        : null,
      officialAccountUrl: this.lineLink.getOfficialAccountUrl(),
    };
  }

  async createLinkCode(clientContactId: string) {
    const contact = await this.prisma.clientContact.findUnique({ where: { id: clientContactId } });
    if (!contact) throw new NotFoundException('Contact not found');
    if (contact.lineUserId) {
      throw new BadRequestException('LINE account is already connected');
    }

    const code = this.generateLinkCode();
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    await this.prisma.clientContact.update({
      where: { id: clientContactId },
      data: { lineLinkCode: code, lineLinkCodeExpiresAt: expiresAt },
    });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      officialAccountUrl: this.lineLink.getOfficialAccountUrl(),
    };
  }

  async disconnect(clientContactId: string) {
    const contact = await this.prisma.clientContact.findUnique({ where: { id: clientContactId } });
    if (!contact) throw new NotFoundException('Contact not found');

    await this.prisma.clientContact.update({
      where: { id: clientContactId },
      data: {
        lineUserId: null,
        lineConnectedAt: null,
        lineLinkCode: null,
        lineLinkCodeExpiresAt: null,
      },
    });

    return { ok: true };
  }

  async handleIncomingMessage(lineUserId: string, text: string): Promise<string | null> {
    const trimmed = text.trim().toUpperCase();
    if (!LINK_CODE_PATTERN.test(trimmed)) return null;

    const contact = await this.prisma.clientContact.findFirst({
      where: { lineLinkCode: trimmed },
    });

    if (!contact) {
      return '❌ รหัสเชื่อมต่อไม่ถูกต้อง กรุณาสร้างรหัสใหม่จาก Portal';
    }

    if (
      !contact.lineLinkCodeExpiresAt ||
      contact.lineLinkCodeExpiresAt.getTime() < Date.now()
    ) {
      return '❌ รหัสเชื่อมต่อหมดอายุแล้ว กรุณาสร้างรหัสใหม่จาก Portal';
    }

    const existing = await this.prisma.clientContact.findFirst({
      where: { lineUserId },
    });
    if (existing && existing.id !== contact.id) {
      return '❌ LINE นี้เชื่อมต่อกับผู้ติดต่ออื่นอยู่แล้ว';
    }

    await this.prisma.clientContact.update({
      where: { id: contact.id },
      data: {
        lineUserId,
        lineConnectedAt: new Date(),
        lineLinkCode: null,
        lineLinkCodeExpiresAt: null,
      },
    });

    this.logger.log(`Linked LINE user ${lineUserId} to ClientContact ${contact.id}`);
    return `✅ เชื่อมต่อสำเร็จ!\nสวัสดีคุณ ${contact.name} คุณจะได้รับแจ้งเตือนเมื่อสำนักงานเผยแพร่เอกสารใหม่ให้คุณ`;
  }

  private generateLinkCode(): string {
    for (let attempt = 0; attempt < 5; attempt++) {
      const suffix = randomBytes(3).toString('hex').toUpperCase();
      return `LF-${suffix}`;
    }
    throw new ConflictException('Could not generate link code');
  }
}
