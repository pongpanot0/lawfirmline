import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClientPortalService case-access scoping', () => {
  let service: ClientPortalService;
  const mockPrisma = {
    client: { findUnique: jest.fn() },
    case: { findMany: jest.fn(), findFirst: jest.fn() },
    calendarEvent: { findFirst: jest.fn() },
    document: { findMany: jest.fn(), findFirst: jest.fn() },
    invoice: { findMany: jest.fn() },
    documentPublication: { findFirst: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const now = new Date();
  const portalUser = {
    clientContactId: 'contact-1',
    clientId: 'client-1',
    firmId: 'firm-1',
    name: 'ทดสอบ',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientPortalService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ClientPortalService);
  });

  describe('getCases', () => {
    it('only queries cases the contact has an active ContactCaseAccess grant for, not all cases for the client', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);

      await service.getCases(portalUser);

      const callArg = mockPrisma.case.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual(
        expect.objectContaining({
          contactAccess: expect.objectContaining({
            some: expect.objectContaining({
              clientContactId: 'contact-1',
            }),
          }),
        }),
      );
    });
  });

  describe('getCase', () => {
    it('throws NotFoundException when the contact has no active access grant for that case, even if the case belongs to the same client', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);

      await expect(service.getCase(portalUser, 'case-1')).rejects.toThrow(NotFoundException);

      const callArg = mockPrisma.case.findFirst.mock.calls[0][0];
      expect(callArg.where.contactAccess).toEqual(
        expect.objectContaining({
          some: expect.objectContaining({ clientContactId: 'contact-1' }),
        }),
      );
    });
  });

  describe('getCase clientUploads', () => {
    it('returns the documents this client uploaded to the case next to the published ones', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', ownRef: 'REF-1' });
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(null);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      const upload = { id: 'doc-9', filename: 'สลิป.pdf', mimeType: 'application/pdf', category: 'FINANCIAL', createdAt: now };
      mockPrisma.document.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([upload]);

      const result = await service.getCase(portalUser, 'case-1');

      expect(mockPrisma.document.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { caseId: 'case-1', uploadedByContact: { clientId: 'client-1' } },
        }),
      );
      expect(result.clientUploads).toEqual([upload]);
      expect(result.documents).toEqual([]);
    });
  });

  describe('getCase portalRequest', () => {
    const submission = {
      id: 'sub-1', referenceNumber: 'PR-001', title: 'ขอร่างสัญญา',
      clientContactId: 'contact-1', accessContactIds: [], revokedContactIds: [],
    };
    beforeEach(() => {
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(null);
      mockPrisma.invoice.findMany.mockResolvedValue([]);
      mockPrisma.document.findMany.mockResolvedValue([]);
    });

    it('returns the request the case was opened from', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', portalIntakeSubmission: submission });

      const result = await service.getCase(portalUser, 'case-1');

      expect(result.portalRequest).toEqual({ id: 'sub-1', referenceNumber: 'PR-001', title: 'ขอร่างสัญญา' });
      expect(result).not.toHaveProperty('portalIntakeSubmission');
    });

    it('returns null when the case has no request or this contact cannot open it', async () => {
      mockPrisma.case.findFirst.mockResolvedValueOnce({ id: 'case-1', portalIntakeSubmission: null });
      expect((await service.getCase(portalUser, 'case-1')).portalRequest).toBeNull();

      mockPrisma.case.findFirst.mockResolvedValueOnce({
        id: 'case-1', portalIntakeSubmission: { ...submission, clientContactId: 'contact-2' },
      });
      expect((await service.getCase(portalUser, 'case-1')).portalRequest).toBeNull();
    });
  });

  describe('getVisibleDocumentFile', () => {
    it('throws NotFoundException when the document has no active publication, even if visibleToClient is true', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(
        service.getVisibleDocumentFile(portalUser, 'doc-1'),
      ).rejects.toThrow(NotFoundException);

      const callArg = mockPrisma.document.findFirst.mock.calls[0][0];
      expect(callArg.where.publications).toEqual(
        expect.objectContaining({
          some: expect.objectContaining({ unpublishedAt: null }),
        }),
      );
    });

    it('writes a DOCUMENT_READ AuditLog entry when the document is found', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        caseId: 'case-1',
        case: { firmId: 'firm-1' },
        publications: [
          {
            id: 'pub-1',
            documentVersion: { version: 1, storagePath: '/tmp/f', filename: 'f.pdf', mimeType: 'application/pdf' },
          },
        ],
      });

      await service.getVisibleDocumentFile(portalUser, 'doc-1');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firmId: 'firm-1',
            action: 'DOCUMENT_READ',
            metadata: { documentPublicationId: 'pub-1', clientContactId: 'contact-1' },
          }),
        }),
      );
    });

    it('returns the FROZEN published version file info, not the document top-level (mutable) fields, when a newer re-upload has occurred', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        caseId: 'case-1',
        case: { firmId: 'firm-1' },
        storagePath: '/uploads/doc-1_v2.pdf',
        filename: 'draft-v2-unreviewed.pdf',
        mimeType: 'application/pdf',
        publications: [
          {
            id: 'pub-1',
            documentVersion: {
              version: 1,
              storagePath: '/uploads/doc-1_v1.pdf',
              filename: 'published-v1.pdf',
              mimeType: 'application/pdf',
            },
          },
        ],
      });

      const result = await service.getVisibleDocumentFile(portalUser, 'doc-1');

      expect(result).toEqual({
        path: '/uploads/doc-1_v1.pdf',
        filename: 'published-v1.pdf',
        mimeType: 'application/pdf',
      });
    });
  });
});
