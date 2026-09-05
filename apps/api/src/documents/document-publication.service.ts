import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from '@lawfirm/shared';
import { PublishDocumentDto } from './dto/publish-document.dto';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { ContactNotificationPreferenceService } from '../notifications/contact-notification-preference.service';

@Injectable()
export class DocumentPublicationService {
  private readonly logger = new Logger(DocumentPublicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineMessaging: LineMessagingService,
    private readonly preferences: ContactNotificationPreferenceService,
  ) {}

  private async verifyDocument(caseId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, caseId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  async publish(user: AuthUser, caseId: string, documentId: string, dto: PublishDocumentDto) {
    const document = await this.verifyDocument(caseId, documentId);

    const documentVersion = await this.prisma.documentVersion.findFirst({
      where: { documentId, version: document.version },
    });
    if (!documentVersion) throw new NotFoundException('Document version not found');

    if (dto.recipientContacts && dto.recipientContacts.length > 0) {
      const legalCase = await this.prisma.case.findUnique({
        where: { id: document.caseId },
        select: { clientId: true },
      });
      if (!legalCase || !legalCase.clientId) throw new NotFoundException('Case not found');
      const validContacts = await this.prisma.clientContact.count({
        where: { id: { in: dto.recipientContacts }, clientId: legalCase.clientId },
      });
      if (validContacts !== dto.recipientContacts.length) {
        throw new BadRequestException('recipientContacts contains contacts that do not belong to this case client');
      }
    }

    await this.prisma.documentPublication.updateMany({
      where: { documentId, unpublishedAt: null },
      data: { unpublishedAt: new Date(), unpublishedById: user.id },
    });

    const publication = await this.prisma.documentPublication.create({
      data: {
        documentId,
        documentVersionId: documentVersion.id,
        publishedById: user.id,
        title: dto.title,
        summary: dto.summary,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : undefined,
        recipientContacts: dto.recipientContacts ?? [],
      },
    });

    await this.notifyPublication(document.caseId, dto.recipientContacts ?? [], publication.title ?? 'เอกสารใหม่');

    return publication;
  }

  private async notifyPublication(caseId: string, recipientContacts: string[], title: string) {
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
      const grantedContactIds = new Set(grants.map((g) => g.clientContactId));

      const targetContactIds =
        recipientContacts.length > 0
          ? recipientContacts.filter((id) => grantedContactIds.has(id))
          : [...grantedContactIds];

      if (targetContactIds.length === 0) return;

      const contacts = await this.prisma.clientContact.findMany({
        where: { id: { in: targetContactIds }, lineUserId: { not: null } },
        select: { id: true, lineUserId: true },
      });

      for (const contact of contacts) {
        try {
          const enabled = await this.preferences.isChannelEnabled(contact.id, 'LINE');
          if (!enabled) continue;
          await this.lineMessaging.pushTo(
            contact.lineUserId!,
            `📄 มีเอกสารใหม่: ${title}\nเข้าดูได้ที่ Client Portal`,
          );
        } catch (err) {
          this.logger.error(`Failed to notify contact ${contact.id}`, err as Error);
        }
      }
    } catch (err) {
      this.logger.error('Failed to dispatch publication notifications', err as Error);
    }
  }

  async unpublish(user: AuthUser, caseId: string, documentId: string, publicationId: string) {
    await this.verifyDocument(caseId, documentId);

    const publication = await this.prisma.documentPublication.findFirst({
      where: { id: publicationId, documentId },
    });
    if (!publication) throw new NotFoundException('Publication not found');

    return this.prisma.documentPublication.update({
      where: { id: publicationId },
      data: { unpublishedAt: new Date(), unpublishedById: user.id },
    });
  }

  async listForDocument(user: AuthUser, caseId: string, documentId: string) {
    await this.verifyDocument(caseId, documentId);

    return this.prisma.documentPublication.findMany({
      where: { documentId },
      include: { documentVersion: { select: { version: true } } },
      orderBy: { publishedAt: 'desc' },
    });
  }
}
