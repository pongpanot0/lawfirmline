import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('ClientPortalIntakeService', () => {
  let service: ClientPortalIntakeService;
  const mockPrisma: any = {
    $transaction: jest.fn(),
    firmMember: { findFirst: jest.fn() },
    client: { findFirst: jest.fn() },
    contactCaseAccess: { upsert: jest.fn() },
    documentDateSuggestion: { create: jest.fn() },
    portalIntakeSubmission: {
      create: jest.fn(),
      update: jest.fn(),
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
    delete: jest.fn().mockResolvedValue(undefined),
    getBuffer: jest.fn(),
    openDownloadStream: jest.fn(),
  };
  const mockCases = { createForPortal: jest.fn() };
  const mockDocuments = { createFromClientBuffer: jest.fn() };
  const mockNotifier = { notifyFirmOwners: jest.fn() };
  const mockFeed = { log: jest.fn() };
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
        { provide: CasesService, useValue: mockCases },
        { provide: DocumentsService, useValue: mockDocuments },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
        { provide: CaseFeedService, useValue: mockFeed },
      ],
    }).compile();
    service = module.get(ClientPortalIntakeService);
  });

  describe('submit', () => {
    const dto = { title: 'ขอคำปรึกษาเรื่องสัญญา', detail: 'รายละเอียด' };
    const file = {
      originalname: 'contract.pdf',
      mimetype: 'application/pdf',
      size: 10,
      buffer: Buffer.from('pdf'),
    } as Express.Multer.File;

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const result = await fn(mockPrisma);
        // notifications must never go out before the transaction commits
        expect(mockNotifier.notifyFirmOwners).not.toHaveBeenCalled();
        return result;
      });
      mockPrisma.portalIntakeSubmission.create.mockResolvedValue({
        id: 'sub-1',
        referenceNumber: 'REQ-1',
        title: dto.title,
      });
      mockPrisma.firmMember.findFirst.mockResolvedValue({ userId: 'owner-1' });
      mockPrisma.client.findFirst.mockResolvedValue({ name: 'บริษัท ก' });
      mockCases.createForPortal.mockResolvedValue({ id: 'case-1', ownRef: 'TSBREF20260001' });
      mockDocuments.createFromClientBuffer.mockResolvedValue({
        id: 'doc-1',
        storagePath: './uploads/cases/case-1/doc-1_v1.pdf',
      });
    });

    it('creates the submission scoped to the authenticated contact, never trusting a client-supplied clientId', async () => {
      await service.submit(portalUser, dto);

      expect(mockPrisma.portalIntakeSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId: 'client-1', clientContactId: 'contact-1', title: dto.title }),
        }),
      );
    });

    it('opens a pre-litigation case led by the first owner, links the submission and grants the contact access', async () => {
      const result = await service.submit(portalUser, dto);

      expect(mockPrisma.firmMember.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { firmId: 'firm-1', role: 'OWNER' },
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(mockCases.createForPortal).toHaveBeenCalledWith(mockPrisma, {
        firmId: 'firm-1',
        clientId: 'client-1',
        clientName: 'บริษัท ก',
        title: dto.title,
        description: dto.detail,
        leadLawyerId: 'owner-1',
      });
      expect(mockPrisma.portalIntakeSubmission.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { caseId: 'case-1' },
      });
      expect(mockPrisma.contactCaseAccess.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientContactId_caseId: { clientContactId: 'contact-1', caseId: 'case-1' } },
          create: expect.objectContaining({ clientContactId: 'contact-1', caseId: 'case-1', grantedById: 'owner-1' }),
        }),
      );
      expect(mockFeed.log).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'case-1', userId: 'owner-1', title: 'ลูกความส่งคำขอผ่านพอร์ทัล' }),
        mockPrisma,
      );
      expect(result).toEqual(expect.objectContaining({ id: 'sub-1', caseId: 'case-1', caseRef: 'TSBREF20260001' }));
    });

    it('adopts uploaded files as case documents from the contact and keeps the request attachment pointing at them', async () => {
      await service.submit(portalUser, dto, [file]);

      expect(mockDocuments.createFromClientBuffer).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          firmId: 'firm-1',
          caseId: 'case-1',
          contactId: 'contact-1',
          actorUserId: 'owner-1',
          filename: 'contract.pdf',
          mimeType: 'application/pdf',
        }),
      );
      expect(mockPrisma.portalIntakeAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          portalIntakeSubmissionId: 'sub-1',
          filename: 'contract.pdf',
          storagePath: './uploads/cases/case-1/doc-1_v1.pdf',
        }),
      });
      expect(mockFileStorage.put).not.toHaveBeenCalled();
    });

    it('removes stored files when the transaction fails after they were written', async () => {
      mockFeed.log.mockRejectedValueOnce(new Error('feed insert failed'));

      await expect(service.submit(portalUser, dto, [file])).rejects.toThrow('feed insert failed');
      expect(mockFileStorage.delete).toHaveBeenCalledWith('./uploads/cases/case-1/doc-1_v1.pdf');
      expect(mockNotifier.notifyFirmOwners).not.toHaveBeenCalled();
    });

    it('notifies firm owners once, after the transaction', async () => {
      await service.submit(portalUser, dto);

      expect(mockNotifier.notifyFirmOwners).toHaveBeenCalledTimes(1);
      expect(mockNotifier.notifyFirmOwners).toHaveBeenCalledWith({
        firmId: 'firm-1',
        actorUserId: '',
        summaryText: `คำขอใหม่จากลูกความ บริษัท ก: ${dto.title}`,
        entityPath: '/cases/case-1',
      });
    });

    it('still succeeds when the notifier throws', async () => {
      mockNotifier.notifyFirmOwners.mockRejectedValueOnce(new Error('LINE down'));

      await expect(service.submit(portalUser, dto)).resolves.toEqual(
        expect.objectContaining({ caseId: 'case-1' }),
      );
    });

    it('creates a PENDING date suggestion on the first adopted document when keyDate is given', async () => {
      await service.submit(portalUser, { ...dto, keyDate: '2026-10-15', keyDateLabel: 'วันที่ได้รับหมาย' }, [file]);

      expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledWith({
        data: {
          caseId: 'case-1',
          documentId: 'doc-1',
          label: 'วันที่ได้รับหมาย',
          suggestedDate: new Date('2026-10-15'),
          status: 'PENDING',
          createdById: 'owner-1',
        },
      });
    });

    it('labels a client key date with the default label and no document when nothing was uploaded', async () => {
      await service.submit(portalUser, { ...dto, keyDate: '2026-10-15' });

      expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ documentId: null, label: 'วันที่จากลูกความ', status: 'PENDING' }),
      });
    });

    it('does not create a date suggestion without keyDate', async () => {
      await service.submit(portalUser, dto);
      expect(mockPrisma.documentDateSuggestion.create).not.toHaveBeenCalled();
    });

    it('rejects the request when the firm has no owner', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue(null);

      await expect(service.submit(portalUser, dto)).rejects.toThrow(
        new BadRequestException('สำนักงานยังไม่มีเจ้าของบัญชี'),
      );
      expect(mockCases.createForPortal).not.toHaveBeenCalled();
      expect(mockNotifier.notifyFirmOwners).not.toHaveBeenCalled();
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
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ clientContactId: 'contact-1' }]),
          }),
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
          clientContactId: 'contact-1',
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

  describe('case link', () => {
    const base = {
      id: 'sub-1', referenceNumber: 'REQ-1', title: 'ท', submittedAt: new Date(), withdrawnByClient: false,
      clientContactId: 'contact-1', intake: null, attachments: [], caseId: 'case-1',
    };

    it('exposes caseId only when this contact has active access to the case', async () => {
      mockPrisma.portalIntakeSubmission.findMany.mockResolvedValue([
        { ...base, case: { contactAccess: [{ id: 'grant-1' }] } },
        { ...base, id: 'sub-2', clientContactId: 'contact-2', case: { contactAccess: [] } },
      ]);

      const result = await service.listMine(portalUser);

      expect(result.map((r) => r.caseId)).toEqual(['case-1', null]);
      const include = mockPrisma.portalIntakeSubmission.findMany.mock.calls[0][0].include;
      expect(include.case.select.contactAccess.where).toEqual(
        expect.objectContaining({ clientContactId: 'contact-1', revokedAt: null }),
      );
    });

    it('hides the case link on a shared request the contact cannot open', async () => {
      mockPrisma.portalIntakeSubmission.findFirst.mockResolvedValue({
        ...base, clientContactId: 'contact-2', detail: 'd', urgencyFlag: false, clientRequestedDate: null,
        case: { contactAccess: [] },
      });

      const result = await service.getMine(portalUser, 'sub-1');

      expect(result.caseId).toBeNull();
    });
  });

  describe('getFirmDocumentFile', () => {
    it('rejects documents that are not visible to the client', async () => {
      mockPrisma.portalIntakeSubmission.findFirst.mockResolvedValue({
        id: 'sub-1',
        clientContactId: 'contact-1',
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
