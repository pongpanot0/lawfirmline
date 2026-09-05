import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { PortalIdentity } from './client-portal-jwt.strategy';

@Injectable()
export class ClientPortalService {
  constructor(private prisma: PrismaService) {}

  async getMe(portalUser: PortalIdentity) {
    const client = await this.prisma.client.findUnique({
      where: { id: portalUser.clientId },
      select: { id: true, name: true },
    });
    return {
      id: portalUser.clientContactId,
      name: portalUser.name,
      email: portalUser.email,
      client,
    };
  }

  async getCases(portalUser: PortalIdentity) {
    const now = new Date();
    return this.prisma.case.findMany({
      where: {
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
      select: {
        id: true,
        ownRef: true,
        title: true,
        status: true,
        courtName: true,
        openedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getCase(portalUser: PortalIdentity, caseId: string) {
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
      select: {
        id: true,
        ownRef: true,
        title: true,
        status: true,
        courtName: true,
        openedAt: true,
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    const [nextHearing, rawDocuments, invoices] = await Promise.all([
      this.prisma.calendarEvent.findFirst({
        where: { caseId, type: 'COURT_DATE', startAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
        select: { id: true, title: true, startAt: true },
      }),
      this.prisma.document.findMany({
        where: {
          caseId,
          publications: {
            some: {
              unpublishedAt: null,
              isInternal: false,
              OR: [
                { recipientContacts: { isEmpty: true } },
                { recipientContacts: { has: portalUser.clientContactId } },
              ],
            },
          },
        },
        select: {
          id: true,
          createdAt: true,
          publications: {
            where: {
              unpublishedAt: null,
              isInternal: false,
              OR: [
                { recipientContacts: { isEmpty: true } },
                { recipientContacts: { has: portalUser.clientContactId } },
              ],
            },
            take: 1,
            orderBy: { publishedAt: 'desc' },
            select: { title: true, documentVersion: { select: { filename: true, mimeType: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { caseId, status: { in: ['SENT', 'PAID'] } },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          issuedAt: true,
          dueAt: true,
          lineItems: {
            select: { id: true, description: true, quantity: true, unitPrice: true, amount: true },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
    ]);

    const documents = rawDocuments.map((doc) => {
      const version = doc.publications[0]?.documentVersion;
      return {
        id: doc.id,
        filename: version?.filename,
        mimeType: version?.mimeType,
        createdAt: doc.createdAt,
      };
    });

    return { ...legalCase, nextHearing, documents, invoices };
  }

  async getVisibleDocumentFile(portalUser: PortalIdentity, documentId: string) {
    const now = new Date();
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        publications: {
          some: {
            unpublishedAt: null,
            isInternal: false,
            OR: [
              { recipientContacts: { isEmpty: true } },
              { recipientContacts: { has: portalUser.clientContactId } },
            ],
          },
        },
        case: {
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
      },
      include: {
        case: { select: { firmId: true } },
        publications: {
          where: {
            unpublishedAt: null,
            isInternal: false,
            OR: [
              { recipientContacts: { isEmpty: true } },
              { recipientContacts: { has: portalUser.clientContactId } },
            ],
          },
          take: 1,
          orderBy: { publishedAt: 'desc' },
          include: { documentVersion: { select: { version: true, storagePath: true, filename: true, mimeType: true } } },
        },
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    await this.prisma.auditLog.create({
      data: {
        firmId: document.case.firmId,
        userId: undefined,
        action: 'DOCUMENT_READ',
        metadata: {
          documentPublicationId: document.publications[0]?.id ?? null,
          clientContactId: portalUser.clientContactId,
        },
      },
    });

    const version = document.publications[0]?.documentVersion;
    if (!version) throw new NotFoundException('Document not found');
    return { path: version.storagePath, filename: version.filename, mimeType: version.mimeType };
  }
}
