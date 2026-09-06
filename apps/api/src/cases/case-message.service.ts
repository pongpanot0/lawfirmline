import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from '@lawfirm/shared';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { LineLinkService } from '../notifications/line-link.service';
import { PortalIdentity } from '../client-portal/client-portal-jwt.strategy';

@Injectable()
export class CaseMessageService {
  private readonly logger = new Logger(CaseMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caseAccess: CaseAccessService,
    private readonly lineMessaging: LineMessagingService,
    private readonly lineLink: LineLinkService,
  ) {}

  async listForStaff(user: AuthUser, caseId: string) {
    const allowed = await this.caseAccess.canAccessCase(user, caseId);
    if (!allowed) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');

    return this.prisma.caseMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createFromStaff(user: AuthUser, caseId: string, body: string) {
    const allowed = await this.caseAccess.canAccessCase(user, caseId);
    if (!allowed) throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');

    const message = await this.prisma.caseMessage.create({
      data: { caseId, senderType: 'STAFF', senderUserId: user.id, body },
    });

    await this.notifyContacts(caseId, body);

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

    return this.prisma.caseMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createFromPortal(portalUser: PortalIdentity, caseId: string, body: string) {
    await this.verifyPortalAccess(portalUser, caseId);

    const message = await this.prisma.caseMessage.create({
      data: { caseId, senderType: 'CONTACT', senderContactId: portalUser.clientContactId, body },
    });

    await this.notifyStaff(caseId, body);

    return message;
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
