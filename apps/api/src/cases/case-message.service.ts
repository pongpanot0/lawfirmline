import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from '@lawfirm/shared';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { LineLinkService } from '../notifications/line-link.service';
import { PortalIdentity } from '../client-portal/client-portal-jwt.strategy';
import { CaseMessageRateLimiterService } from './case-message-rate-limiter.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { randomUUID } from 'crypto';

@Injectable()
export class CaseMessageService {
  private readonly logger = new Logger(CaseMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caseAccess: CaseAccessService,
    private readonly lineMessaging: LineMessagingService,
    private readonly lineLink: LineLinkService,
    private readonly rateLimiter: CaseMessageRateLimiterService,
    private readonly files: FileStorageService,
  ) {}

  /** ข้อความเปล่าและไม่มีไฟล์คือการกดส่งพลาด ไม่ใช่ข้อความ */
  private assertHasContent(body: string | undefined, file?: Express.Multer.File) {
    if (!body?.trim() && !file) {
      throw new BadRequestException('พิมพ์ข้อความหรือแนบไฟล์อย่างน้อยหนึ่งอย่าง');
    }
  }

  /**
   * เก็บไฟล์ที่แนบมากับข้อความ แล้วคืนฟิลด์ที่จะบันทึกลงแถว
   * — ชื่อไฟล์ที่ multer ส่งมาเป็น latin1 ต้องแปลงเป็น utf8 ไม่งั้นชื่อไทยเพี้ยน
   */
  private async storeAttachment(caseId: string, file?: Express.Multer.File) {
    if (!file) return {};
    const key = `case-messages/${caseId}/${randomUUID()}`;
    const storagePath = await this.files.put(key, file.buffer, file.mimetype);
    return {
      filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      storagePath,
      mimeType: file.mimetype,
      size: file.size,
    };
  }

  /** ไฟล์ของข้อความในคดีที่ผู้ใช้มีสิทธิ์เข้าถึง */
  async getAttachment(user: AuthUser, caseId: string, messageId: string) {
    const allowed = await this.caseAccess.canAccessCase(user, caseId);
    if (!allowed) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');
    const message = await this.prisma.caseMessage.findFirst({
      where: { id: messageId, caseId },
    });
    if (!message?.storagePath) throw new NotFoundException('ไม่พบไฟล์แนบ');
    return {
      buffer: await this.files.getBuffer(message.storagePath),
      filename: message.filename ?? 'attachment',
      mimeType: message.mimeType ?? 'application/octet-stream',
    };
  }

  async listForStaff(user: AuthUser, caseId: string) {
    const allowed = await this.caseAccess.canAccessCase(user, caseId);
    if (!allowed) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');

    return this.prisma.caseMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createFromStaff(user: AuthUser, caseId: string, body: string, file?: Express.Multer.File) {
    this.assertHasContent(body, file);
    const allowed = await this.caseAccess.canAccessCase(user, caseId);
    if (!allowed) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');

    if (!this.rateLimiter.recordSend(user.id)) {
      throw new BadRequestException('ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
    }

    const message = await this.prisma.caseMessage.create({
      data: {
        caseId,
        senderType: 'STAFF',
        senderUserId: user.id,
        body,
        ...(await this.storeAttachment(caseId, file)),
      },
    });

    await this.writeAuditLog({
      firmId: user.firmId,
      userId: user.id,
      action: 'CASE_MESSAGE_SENT',
      metadata: { caseId, messageId: message.id, senderType: 'STAFF' },
    });

    await this.notifyContacts(caseId, body || `ส่งไฟล์: ${message.filename}`);

    return message;
  }

  private async verifyPortalAccess(portalUser: PortalIdentity, caseId: string) {
    const now = new Date();
    const legalCase = await this.prisma.case.findFirst({
      where: {
        id: caseId,
        clientId: portalUser.clientId,
        contactAccess: {
          some: {
            clientContactId: portalUser.clientContactId,
            revokedAt: null,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        },
      },
    });
    if (!legalCase) throw new NotFoundException('ไม่พบคดีนี้');
    return legalCase;
  }

  async listForPortal(portalUser: PortalIdentity, caseId: string) {
    await this.verifyPortalAccess(portalUser, caseId);

    const messages = await this.prisma.caseMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });

    // Viewing a case's messages counts as reading them — clears the portal
    // dashboard's unread-messages count for this contact.
    await this.prisma.clientContact.update({
      where: { id: portalUser.clientContactId },
      data: { lastSeenMessagesAt: new Date() },
    });

    return messages;
  }

  async createFromPortal(
    portalUser: PortalIdentity,
    caseId: string,
    body: string,
    file?: Express.Multer.File,
  ) {
    this.assertHasContent(body, file);
    await this.verifyPortalAccess(portalUser, caseId);

    if (!this.rateLimiter.recordSend(portalUser.clientContactId)) {
      throw new BadRequestException('ส่งข้อความบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
    }

    const message = await this.prisma.caseMessage.create({
      data: {
        caseId,
        senderType: 'CONTACT',
        senderContactId: portalUser.clientContactId,
        body,
        ...(await this.storeAttachment(caseId, file)),
      },
    });

    await this.writeAuditLog({
      firmId: portalUser.firmId,
      userId: null,
      action: 'CASE_MESSAGE_SENT',
      metadata: {
        caseId,
        messageId: message.id,
        senderType: 'CONTACT',
        clientContactId: portalUser.clientContactId,
      },
    });

    await this.notifyStaff(caseId, body || `ส่งไฟล์: ${message.filename}`);

    return message;
  }

  private async writeAuditLog(data: {
    firmId: string;
    userId: string | null;
    action: string;
    metadata: Prisma.InputJsonValue;
  }) {
    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.error('Failed to write audit log for case message', err as Error);
    }
  }

  private async notifyContacts(caseId: string, body: string) {
    try {
      const now = new Date();
      const grants = await this.prisma.contactCaseAccess.findMany({
        where: {
          caseId,
          revokedAt: null,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
        select: { clientContactId: true },
      });
      const contactIds = grants.map((g) => g.clientContactId);
      if (contactIds.length === 0) return;

      const contacts = await this.prisma.clientContact.findMany({
        where: { id: { in: contactIds }, lineUserId: { not: null } },
        select: { id: true, lineUserId: true },
      });

      for (const contact of contacts) {
        try {
          await this.lineMessaging.pushTo(
            contact.lineUserId!,
            `💬 ข้อความใหม่จากสำนักงาน:\n${body}`,
          );
        } catch (err) {
          this.logger.error(`Failed to notify contact ${contact.id} of new message`, err as Error);
        }
      }
    } catch (err) {
      this.logger.error('Failed to dispatch message notifications to contacts', err as Error);
    }
  }

  private async notifyStaff(caseId: string, body: string) {
    try {
      const lineUserIds = await this.lineLink.getLineUserIdsForCase(caseId);
      for (const lineUserId of lineUserIds) {
        try {
          await this.lineMessaging.pushTo(lineUserId, `💬 ข้อความใหม่จากลูกความ:\n${body}`);
        } catch (err) {
          this.logger.error(`Failed to notify staff ${lineUserId} of new message`, err as Error);
        }
      }
    } catch (err) {
      this.logger.error('Failed to dispatch message notifications to staff', err as Error);
    }
  }
}
