import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { PortalIdentity } from './client-portal-jwt.strategy';

@Injectable()
export class ClientPortalService {
  constructor(private prisma: PrismaService) {}

  async getMe(portalUser: PortalIdentity) {
    const [client, contact] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: portalUser.clientId },
        select: { id: true, name: true },
      }),
      this.prisma.clientContact.findUnique({
        where: { id: portalUser.clientContactId },
        select: { passwordHash: true },
      }),
    ]);
    return {
      id: portalUser.clientContactId,
      name: portalUser.name,
      email: portalUser.email,
      hasPassword: Boolean(contact?.passwordHash),
      client,
    };
  }

  private accessibleCaseWhere(portalUser: PortalIdentity) {
    const now = new Date();
    return {
      clientId: portalUser.clientId,
      contactAccess: {
        some: {
          clientContactId: portalUser.clientContactId,
          revokedAt: null,
          startDate: { lte: now },
          OR: [{ endDate: null }, { endDate: { gte: now } }],
        },
      },
    };
  }

  private visibleDocumentPublicationWhere(clientContactId: string) {
    return {
      unpublishedAt: null,
      isInternal: false,
      OR: [{ recipientContacts: { isEmpty: true } }, { recipientContacts: { has: clientContactId } }],
    };
  }

  async getCases(portalUser: PortalIdentity) {
    const cases = await this.prisma.case.findMany({
      where: this.accessibleCaseWhere(portalUser),
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

    const caseIds = cases.map((c) => c.id);
    const hearings = caseIds.length
      ? await this.prisma.calendarEvent.findMany({
          where: { caseId: { in: caseIds }, type: 'COURT_DATE', startAt: { gte: new Date() } },
          orderBy: { startAt: 'asc' },
          select: { caseId: true, id: true, title: true, startAt: true },
        })
      : [];
    const nextHearingByCase = new Map<string, { id: string; title: string; startAt: Date }>();
    for (const hearing of hearings) {
      if (!nextHearingByCase.has(hearing.caseId)) {
        nextHearingByCase.set(hearing.caseId, { id: hearing.id, title: hearing.title, startAt: hearing.startAt });
      }
    }

    return cases.map((c) => ({ ...c, nextHearing: nextHearingByCase.get(c.id) ?? null }));
  }

  async getDashboardSummary(portalUser: PortalIdentity) {
    const [cases, contact] = await Promise.all([
      this.prisma.case.findMany({
        where: this.accessibleCaseWhere(portalUser),
        select: { id: true, title: true, status: true, updatedAt: true },
      }),
      this.prisma.clientContact.findUnique({
        where: { id: portalUser.clientContactId },
        select: { lastSeenMessagesAt: true },
      }),
    ]);

    const caseIds = cases.map((c) => c.id);
    const caseTitleById = new Map(cases.map((c) => [c.id, c.title]));
    const activeCases = cases.filter((c) => c.status !== 'CLOSED').length;

    if (caseIds.length === 0) {
      return {
        activeCases: 0,
        totalCases: 0,
        nextHearing: null,
        pendingDocuments: 0,
        unreadMessages: 0,
        recentActivity: [],
        recentDocuments: [],
      };
    }

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const publicationWhere = this.visibleDocumentPublicationWhere(portalUser.clientContactId);

    const [nextHearing, recentPublications, unreadMessages, recentMessages, recentHearings] = await Promise.all([
      this.prisma.calendarEvent.findFirst({
        where: { caseId: { in: caseIds }, type: 'COURT_DATE', startAt: { gte: new Date() } },
        orderBy: { startAt: 'asc' },
        select: { id: true, caseId: true, title: true, startAt: true, courtName: true },
      }),
      this.prisma.documentPublication.findMany({
        where: { ...publicationWhere, document: { caseId: { in: caseIds } } },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          publishedAt: true,
          document: { select: { id: true, caseId: true } },
          documentVersion: { select: { filename: true, mimeType: true } },
        },
      }),
      this.prisma.caseMessage.count({
        where: {
          caseId: { in: caseIds },
          senderType: 'STAFF',
          createdAt: contact?.lastSeenMessagesAt ? { gt: contact.lastSeenMessagesAt } : undefined,
        },
      }),
      this.prisma.caseMessage.findMany({
        where: { caseId: { in: caseIds }, senderType: 'STAFF' },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, caseId: true, createdAt: true },
      }),
      this.prisma.calendarEvent.findMany({
        where: { caseId: { in: caseIds } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, caseId: true, title: true, startAt: true, createdAt: true },
      }),
    ]);

    const pendingDocuments = recentPublications.filter((p) => p.publishedAt >= fourteenDaysAgo).length;

    // The query above filters `document: { caseId: { in: caseIds } } }`, so
    // every matched publication's document is guaranteed to have a non-null
    // caseId — Document.caseId is nullable in the schema only to support
    // documents attached directly to an Intake instead of a Case.
    const recentDocuments = recentPublications.slice(0, 5).map((p) => ({
      documentId: p.document.id,
      caseId: p.document.caseId!,
      caseTitle: caseTitleById.get(p.document.caseId!) ?? '',
      filename: p.documentVersion?.filename ?? '',
      mimeType: p.documentVersion?.mimeType ?? '',
      publishedAt: p.publishedAt,
    }));

    type ActivityItem = { type: string; caseId: string; caseTitle: string; label: string; occurredAt: Date };
    const activity: ActivityItem[] = [
      ...recentPublications.slice(0, 6).map((p) => ({
        type: 'document',
        caseId: p.document.caseId!,
        caseTitle: caseTitleById.get(p.document.caseId!) ?? '',
        label: p.documentVersion?.filename ?? 'เอกสารใหม่',
        occurredAt: p.publishedAt,
      })),
      ...recentMessages.map((m) => ({
        type: 'message',
        caseId: m.caseId,
        caseTitle: caseTitleById.get(m.caseId) ?? '',
        label: 'ข้อความใหม่จากทนายความ',
        occurredAt: m.createdAt,
      })),
      ...recentHearings.map((h) => ({
        type: 'hearing',
        caseId: h.caseId,
        caseTitle: caseTitleById.get(h.caseId) ?? '',
        label: h.title,
        occurredAt: h.createdAt,
      })),
    ]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, 6);

    return {
      activeCases,
      totalCases: cases.length,
      nextHearing,
      pendingDocuments,
      unreadMessages,
      recentActivity: activity,
      recentDocuments,
    };
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
    if (!document.case) throw new NotFoundException('Document not found');

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
