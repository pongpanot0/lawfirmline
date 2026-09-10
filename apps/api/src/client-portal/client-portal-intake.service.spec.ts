import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('ClientPortalIntakeService', () => {
  let service: ClientPortalIntakeService;
  const mockPrisma = {
    portalIntakeSubmission: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    portalIntakeAttachment: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const mockFileStorage = {
    put: jest.fn(async (key: string) => key),
    delete: jest.fn(),
    getBuffer: jest.fn(),
    openDownloadStream: jest.fn(),
  };
  const portalUser = {
    clientContactId: 'contact-1',
    clientId: 'client-1',
    firmId: 'firm-1',
    name: 'ทดสอบ',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.document.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalIntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(ClientPortalIntakeService);
  });

  describe('submit', () => {
    it('creates a submission scoped to the authenticated contact and client, never trusting a client-supplied clientId', async () => {
      mockPrisma.portalIntakeSubmission.count.mockResolvedValue(0);
      mockPrisma.portalIntakeSubmission.create.mockResolvedValue({
        id: 'sub-1',
        referenceNumber: 'REQ-000001',
        clientId: 'client-1',
        clientContactId: 'contact-1',
        title: 'ขอคำปรึกษาเรื่องสัญญา',
        detail: 'รายละเอียด',
        urgencyFlag: false,
        withdrawnByClient: false,
        submittedAt: new Date('2026-09-05'),
      });

      const result = await service.submit(portalUser, {
        title: 'ขอคำปรึกษาเรื่องสัญญา',
        detail: 'รายละเอียด',
      });

      expect(mockPrisma.portalIntakeSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-1',
            clientContactId: 'contact-1',
            title: 'ขอคำปรึกษาเรื่องสัญญา',
          }),
        }),
      );
      expect(result.referenceNumber).toMatch(/^REQ-\d{6}$/);
    });
  });

  describe('listMine', () => {
    it('only returns submissions belonging to the authenticated contact', async () => {
      mockPrisma.portalIntakeSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          referenceNumber: 'REQ-1',
          title: 'ท',
          submittedAt: new Date(),
          withdrawnByClient: false,
          clientContactId: 'contact-1',
          intake: null,
          attachments: [],
        },
      ]);

      await service.listMine(portalUser);

      expect(mockPrisma.portalIntakeSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientContactId: 'contact-1' }),
        }),
      );
    });

    it('includes firm documents marked visibleToClient for linked intakes', async () => {
      mockPrisma.portalIntakeSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          referenceNumber: 'REQ-1',
          title: 'ท',
          submittedAt: new Date(),
          withdrawnByClient: false,
          intake: { id: 'intake-1', status: 'ASSESSING', decision: 'PENDING' },
          attachments: [{ id: 'a1', filename: 'mine.pdf', size: 10 }],
        },
      ]);
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          filename: 'reply.pdf',
          mimeType: 'application/pdf',
          createdAt: new Date('2026-09-09'),
          intakeId: 'intake-1',
        },
      ]);

      const result = await service.listMine(portalUser);

      expect(result[0].externalStatus).toBe('รอตกลงขอบเขต');
      expect(result[0].attachments).toHaveLength(1);
      expect(result[0].firmDocuments).toEqual([
        expect.objectContaining({ id: 'doc-1', filename: 'reply.pdf' }),
      ]);
    });
  });

  describe('getFirmDocumentFile', () => {
    it('rejects documents that are not visible to the client', async () => {
      mockPrisma.portalIntakeSubmission.findFirst.mockResolvedValue({
        id: 'sub-1',
        intake: { id: 'intake-1' },
      });
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.getFirmDocumentFile(portalUser, 'sub-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ visibleToClient: true, intakeId: 'intake-1' }),
        }),
      );
    });
  });
});
