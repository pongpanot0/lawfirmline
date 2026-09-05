import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { AuthUser } from '@lawfirm/shared';
import { PublishDocumentDto } from './dto/publish-document.dto';

@Injectable()
export class DocumentPublicationService {
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.documentPublication.create({
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
