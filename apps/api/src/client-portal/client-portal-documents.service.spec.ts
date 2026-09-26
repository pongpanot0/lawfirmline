import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentCategory } from '@lawfirm/shared';
import { ClientPortalDocumentsService } from './client-portal-documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { DocumentsService } from '../documents/documents.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

describe('ClientPortalDocumentsService.uploadToCase', () => {
  let service: ClientPortalDocumentsService;
  const mockPrisma: any = {
    $transaction: jest.fn(),
    case: { findFirst: jest.fn() },
    firmMember: { findFirst: jest.fn(), findMany: jest.fn() },
    documentDateSuggestion: { create: jest.fn() },
  };
  const mockFileStorage = { delete: jest.fn().mockResolvedValue(undefined) };
  const mockDocuments = { createFromClientBuffer: jest.fn() };
  const mockNotifier = { notifyAssigned: jest.fn() };
  const portalUser = {
    clientContactId: 'contact-1',
    clientId: 'client-1',
    firmId: 'firm-1',
    name: 'ทดสอบ',
    email: 'test@example.com',
  };
  const file = {
    originalname: 'receipt.pdf',
    mimetype: 'application/pdf',
    size: 10,
    buffer: Buffer.from('pdf'),
  } as Express.Multer.File;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const result = await fn(mockPrisma);
      expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
      return result;
    });
    mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', ownRef: 'TSBREF20260001', leadLawyerId: 'lawyer-1' });
    mockPrisma.firmMember.findFirst.mockResolvedValue({ userId: 'owner-1' });
    mockPrisma.firmMember.findMany.mockResolvedValue([{ userId: 'owner-1' }, { userId: 'owner-2' }]);
    mockDocuments.createFromClientBuffer.mockResolvedValue({
      id: 'doc-1',
      filename: 'receipt.pdf',
      storagePath: './uploads/cases/case-1/doc-1_v1.pdf',
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalDocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
        { provide: DocumentsService, useValue: mockDocuments },
        { provide: AssignmentNotifierService, useValue: mockNotifier },
      ],
    }).compile();
    service = module.get(ClientPortalDocumentsService);
  });

  it('refuses a contact without an active access grant to the case', async () => {
    mockPrisma.case.findFirst.mockResolvedValue(null);

    await expect(service.uploadToCase(portalUser, 'case-1', {}, file)).rejects.toThrow(NotFoundException);

    const where = mockPrisma.case.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        id: 'case-1',
        clientId: 'client-1',
        contactAccess: { some: expect.objectContaining({ clientContactId: 'contact-1', revokedAt: null }) },
      }),
    );
    expect(mockDocuments.createFromClientBuffer).not.toHaveBeenCalled();
  });

  it('refuses a request without a file', async () => {
    await expect(service.uploadToCase(portalUser, 'case-1', {}, undefined)).rejects.toThrow(BadRequestException);
  });

  it('stores the file as a document from the contact with the typed category and note', async () => {
    await service.uploadToCase(portalUser, 'case-1', { docType: DocumentCategory.FINANCIAL, note: 'สลิปโอนเงินงวดแรก' }, file);

    expect(mockDocuments.createFromClientBuffer).toHaveBeenCalledWith(mockPrisma, {
      firmId: 'firm-1',
      caseId: 'case-1',
      contactId: 'contact-1',
      actorUserId: 'owner-1',
      filename: 'receipt.pdf',
      buffer: file.buffer,
      mimeType: 'application/pdf',
      category: 'FINANCIAL',
      description: 'สลิปโอนเงินงวดแรก',
    });
    expect(mockPrisma.documentDateSuggestion.create).not.toHaveBeenCalled();
  });

  it('creates a PENDING date suggestion on the document when keyDate is given', async () => {
    await service.uploadToCase(portalUser, 'case-1', { keyDate: '2026-10-15' }, file);

    expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        documentId: 'doc-1',
        label: 'วันที่จากลูกความ',
        suggestedDate: new Date('2026-10-15'),
        status: 'PENDING',
        createdById: 'owner-1',
      },
    });
  });

  it('notifies the lead lawyer and the owners after commit', async () => {
    await service.uploadToCase(portalUser, 'case-1', {}, file);

    expect(mockNotifier.notifyAssigned).toHaveBeenCalledWith({
      firmId: 'firm-1',
      userIds: ['lawyer-1', 'owner-1', 'owner-2'],
      actorUserId: '',
      summaryText: 'ลูกความอัปโหลดเอกสาร receipt.pdf ในคดี TSBREF20260001',
      entityPath: '/cases/case-1?tab=documents',
    });
  });

  it('still succeeds when notifying fails', async () => {
    mockNotifier.notifyAssigned.mockRejectedValueOnce(new Error('LINE down'));

    await expect(service.uploadToCase(portalUser, 'case-1', {}, file)).resolves.toEqual(
      expect.objectContaining({ id: 'doc-1' }),
    );
  });

  it('removes the stored file when the transaction fails after it was written', async () => {
    mockPrisma.documentDateSuggestion.create.mockRejectedValueOnce(new Error('insert failed'));

    await expect(service.uploadToCase(portalUser, 'case-1', { keyDate: '2026-10-15' }, file)).rejects.toThrow('insert failed');
    expect(mockFileStorage.delete).toHaveBeenCalledWith('./uploads/cases/case-1/doc-1_v1.pdf');
    expect(mockNotifier.notifyAssigned).not.toHaveBeenCalled();
  });
});

describe('ClientPortalDocumentsService.getClientUploadFile', () => {
  let service: ClientPortalDocumentsService;
  const mockPrisma: any = { document: { findFirst: jest.fn() } };
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
      providers: [
        ClientPortalDocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: {} },
        { provide: DocumentsService, useValue: {} },
        { provide: AssignmentNotifierService, useValue: {} },
      ],
    }).compile();
    service = module.get(ClientPortalDocumentsService);
  });

  it('returns the file when the contact uploaded it to a case they can still access', async () => {
    mockPrisma.document.findFirst.mockResolvedValue({
      storagePath: './uploads/doc-1.pdf',
      filename: 'receipt.pdf',
      mimeType: 'application/pdf',
    });

    const result = await service.getClientUploadFile(portalUser, 'case-1', 'doc-1');

    expect(result).toEqual({ path: './uploads/doc-1.pdf', filename: 'receipt.pdf', mimeType: 'application/pdf' });
    const where = mockPrisma.document.findFirst.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        id: 'doc-1',
        caseId: 'case-1',
        uploadedByContact: { clientId: 'client-1' },
      }),
    );
  });

  it('404s when the document belongs to another client', async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);

    await expect(service.getClientUploadFile(portalUser, 'case-1', 'doc-1')).rejects.toThrow(NotFoundException);
  });

  it('404s when the contact access to the case was revoked', async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);

    await expect(service.getClientUploadFile(portalUser, 'case-1', 'doc-1')).rejects.toThrow(NotFoundException);
    const where = mockPrisma.document.findFirst.mock.calls[0][0].where;
    expect(where.case.contactAccess.some.revokedAt).toBeNull();
  });
});
