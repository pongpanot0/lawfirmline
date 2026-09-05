import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentPublicationService } from './document-publication.service';
import { PrismaService } from '../prisma/prisma.module';

describe('DocumentPublicationService', () => {
  let service: DocumentPublicationService;
  const mockPrisma = {
    document: { findFirst: jest.fn() },
    documentVersion: { findFirst: jest.fn() },
    documentPublication: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    case: { findUnique: jest.fn() },
    clientContact: { count: jest.fn() },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentPublicationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(DocumentPublicationService);
  });

  describe('publish', () => {
    it('throws NotFoundException when the document does not belong to the given case', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.publish(user, 'case-1', 'doc-1', {})).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-1', caseId: 'case-1' },
      });
    });

    it('publishes the document current version when found', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1', version: 2 });
      mockPrisma.documentVersion.findFirst.mockResolvedValue({ id: 'ver-2', version: 2 });
      mockPrisma.documentPublication.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.documentPublication.create.mockResolvedValue({ id: 'pub-1' });

      await service.publish(user, 'case-1', 'doc-1', { title: 'สรุปคดี' });

      expect(mockPrisma.documentVersion.findFirst).toHaveBeenCalledWith({
        where: { documentId: 'doc-1', version: 2 },
      });
      expect(mockPrisma.documentPublication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentId: 'doc-1',
            documentVersionId: 'ver-2',
            publishedById: 'user-1',
            title: 'สรุปคดี',
          }),
        }),
      );
    });

    it('unpublishes any existing active publication before creating a new one', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1', version: 2 });
      mockPrisma.documentVersion.findFirst.mockResolvedValue({ id: 'ver-2', version: 2 });
      mockPrisma.documentPublication.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.documentPublication.create.mockResolvedValue({ id: 'pub-2' });

      await service.publish(user, 'case-1', 'doc-1', {});

      expect(mockPrisma.documentPublication.updateMany).toHaveBeenCalledWith({
        where: { documentId: 'doc-1', unpublishedAt: null },
        data: { unpublishedAt: expect.any(Date), unpublishedById: 'user-1' },
      });
      const updateManyOrder = mockPrisma.documentPublication.updateMany.mock.invocationCallOrder[0];
      const createOrder = mockPrisma.documentPublication.create.mock.invocationCallOrder[0];
      expect(updateManyOrder).toBeLessThan(createOrder);
    });

    it('throws BadRequestException when a recipient contact does not belong to the case client', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1', version: 2 });
      mockPrisma.documentVersion.findFirst.mockResolvedValue({ id: 'ver-2', version: 2 });
      mockPrisma.case.findUnique.mockResolvedValue({ clientId: 'client-1' });
      mockPrisma.clientContact.count.mockResolvedValue(1);

      await expect(
        service.publish(user, 'case-1', 'doc-1', { recipientContacts: ['contact-1', 'contact-2'] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates the publication when all recipient contacts belong to the case client', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1', version: 2 });
      mockPrisma.documentVersion.findFirst.mockResolvedValue({ id: 'ver-2', version: 2 });
      mockPrisma.case.findUnique.mockResolvedValue({ clientId: 'client-1' });
      mockPrisma.clientContact.count.mockResolvedValue(1);
      mockPrisma.documentPublication.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.documentPublication.create.mockResolvedValue({ id: 'pub-1' });

      await service.publish(user, 'case-1', 'doc-1', { recipientContacts: ['contact-1'] });

      expect(mockPrisma.documentPublication.create).toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    it('throws NotFoundException when the publication does not belong to the given document', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1' });
      mockPrisma.documentPublication.findFirst.mockResolvedValue(null);

      await expect(service.unpublish(user, 'case-1', 'doc-1', 'pub-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.documentPublication.findFirst).toHaveBeenCalledWith({
        where: { id: 'pub-1', documentId: 'doc-1' },
      });
    });

    it('sets unpublishedAt/unpublishedById when the publication is found', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1' });
      mockPrisma.documentPublication.findFirst.mockResolvedValue({ id: 'pub-1' });
      mockPrisma.documentPublication.update.mockResolvedValue({ id: 'pub-1' });

      await service.unpublish(user, 'case-1', 'doc-1', 'pub-1');

      expect(mockPrisma.documentPublication.update).toHaveBeenCalledWith({
        where: { id: 'pub-1' },
        data: { unpublishedAt: expect.any(Date), unpublishedById: 'user-1' },
      });
    });
  });
});
