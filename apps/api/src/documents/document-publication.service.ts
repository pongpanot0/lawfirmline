import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from '@lawfirm/shared';
import { PublishDocumentDto } from './dto/publish-document.dto';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { ContactNotificationPreferenceService } from '../notifications/contact-notification-preference.service';
import { EmailService } from '../notifications/email.service';
import { NotificationChannel } from '../generated/prisma';

const DEFAULT_APP_URL = 'http://localhost:3005';
const DEFAULT_FIRM_NAME = 'สำนักงานกฎหมาย';

@Injectable()
export class DocumentPublicationService {
  private readonly logger = new Logger(DocumentPublicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lineMessaging: LineMessagingService,
    private readonly preferences: ContactNotificationPreferenceService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
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
    if (!document.caseId) throw new NotFoundException('Case not found');

    if (dto.recipientContacts && dto.recipientContacts.length > 0) {
      const legalCase = await this.prisma.case.findUnique({
        where: { id: caseId },
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

    await this.notifyPublication(caseId, dto.recipientContacts ?? [], publication.title ?? 'เอกสารใหม่');

    return publication;
  }

  private async notifyPublication(caseId: string, recipientContacts: string[], title: string) {
    try {
      const now = new Date();
      const [grants, legalCase] = await Promise.all([
        this.prisma.contactCaseAccess.findMany({
          where: {
            caseId,
            revokedAt: null,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
          select: { clientContactId: true },
        }),
        this.prisma.case.findUnique({
          where: { id: caseId },
          select: { client: { select: { firm: { select: { name: true } } } } },
        }),
      ]);
      const firmName = legalCase?.client?.firm?.name ?? DEFAULT_FIRM_NAME;
      const grantedContactIds = new Set(grants.map((g) => g.clientContactId));

      const targetContactIds =
        recipientContacts.length > 0
          ? recipientContacts.filter((id) => grantedContactIds.has(id))
          : [...grantedContactIds];

      if (targetContactIds.length === 0) return;

      const contacts = await this.prisma.clientContact.findMany({
        where: {
          id: { in: targetContactIds },
          OR: [{ lineUserId: { not: null } }, { email: { not: null } }],
        },
        select: { id: true, lineUserId: true, email: true, name: true },
      });

      if (contacts.length === 0) return;

      const portalUrl = `${this.config.get<string>('APP_URL') ?? DEFAULT_APP_URL}/portal`;

      const contactIds = contacts.map((c) => c.id);
      const [lineEnabled, emailEnabled] = await Promise.all([
        this.preferences.getEnabledMap(contactIds, NotificationChannel.LINE),
        this.preferences.getEnabledMap(contactIds, NotificationChannel.EMAIL),
      ]);

      for (const contact of contacts) {
        if (contact.lineUserId) {
          try {
            const enabled = lineEnabled.get(contact.id) ?? true;
            if (enabled) {
              await this.lineMessaging.pushTo(
                contact.lineUserId,
                `📄 มีเอกสารใหม่: ${title}\nเข้าดูได้ที่ Client Portal`,
              );
            }
          } catch (err) {
            this.logger.error(`Failed to notify contact ${contact.id} via LINE`, err as Error);
          }
        }

        if (contact.email) {
          try {
            const enabled = emailEnabled.get(contact.id) ?? false;
            if (enabled) {
              await this.emailService.sendDocumentPublishedEmail({
                to: contact.email,
                contactName: contact.name,
                firmName,
                documentTitle: title,
                portalUrl,
              });
            }
          } catch (err) {
            this.logger.error(`Failed to notify contact ${contact.id} via email`, err as Error);
          }
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
