import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { DocumentsService } from '../../documents/documents.service';
import { FileStorageService } from '../../common/services/file-storage.service';
import { decodeUploadFilename } from '../../common/utils/decode-upload-filename';
import { GraphDriveClient } from '../graph/graph-drive.client';
import { GraphApiError } from '../graph/graph-http';
import { CaseDriveService } from './case-drive.service';
import { DocumentOfficeService, syncStamp } from './document-office.service';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('DocumentOfficeService', () => {
  let service: DocumentOfficeService;
  const mockPrisma: any = {
    document: { findFirst: jest.fn() },
    documentOfficeLink: { upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  };
  const mockCaseDrive = { ownToken: jest.fn(), findLink: jest.fn(), tokenForConnection: jest.fn(), audit: jest.fn() };
  const mockDrive = { upload: jest.fn(), replaceContent: jest.fn(), getItem: jest.fn(), downloadContent: jest.fn(), ensureFolderPath: jest.fn() };
  const mockDocuments = { uploadNewVersion: jest.fn() };
  const mockStorage = { getBuffer: jest.fn() };
  const user = { id: 'u1', firmId: 'f1' } as unknown as AuthUser;

  const baseDoc = {
    id: 'd1',
    caseId: 'c1',
    filename: 'สัญญาเช่า.docx',
    mimeType: DOCX,
    version: 2,
    storagePath: 'cases/c1/d1_v2.docx',
    case: { ownRef: '2569/0012' },
    officeLink: null as any,
  };
  const officeLink = {
    id: 'ol1',
    connectionId: 'conn-a',
    driveId: 'b!drv',
    itemId: 'IT',
    webUrl: 'https://word/IT',
    uploadedVersion: 2,
    updatedAt: new Date('2026-10-13T08:00:00Z'),
  };
  const uploaded = {
    id: 'NEW',
    webUrl: 'https://word/NEW',
    lastModifiedDateTime: '2026-10-13T08:00:00Z',
    parentReference: { driveId: 'b!drv' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockStorage.getBuffer.mockResolvedValue(Buffer.from('docx-bytes'));
    mockCaseDrive.ownToken.mockResolvedValue({ connectionId: 'conn-me', token: 'tok-me' });
    const module = await Test.createTestingModule({
      providers: [
        DocumentOfficeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseDriveService, useValue: mockCaseDrive },
        { provide: GraphDriveClient, useValue: mockDrive },
        { provide: DocumentsService, useValue: mockDocuments },
        { provide: FileStorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(DocumentOfficeService);
  });

  describe('open', () => {
    it('only opens Word/Excel/PowerPoint files', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, filename: 'คำพิพากษา.pdf' });
      await expect(service.open(user, 'c1', 'd1')).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDrive.upload).not.toHaveBeenCalled();
    });

    it('first open uploads the latest version into the case’s linked folder', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(baseDoc);
      mockCaseDrive.findLink.mockResolvedValue({ driveId: 'b!drv', externalId: 'FOLDER' });
      mockDrive.upload.mockResolvedValue(uploaded);

      await expect(service.open(user, 'c1', 'd1')).resolves.toEqual({ webUrl: 'https://word/NEW' });

      expect(mockDrive.upload).toHaveBeenCalledWith('tok-me', 'b!drv', 'FOLDER', 'สัญญาเช่า.docx', Buffer.from('docx-bytes'), DOCX);
      expect(mockPrisma.documentOfficeLink.upsert.mock.calls[0][0].create).toMatchObject({
        documentId: 'd1',
        connectionId: 'conn-me',
        driveId: 'b!drv',
        itemId: 'NEW',
        webUrl: 'https://word/NEW',
        uploadedVersion: 2,
      });
      expect(mockCaseDrive.audit).toHaveBeenCalledWith(user, 'DOCUMENT_OFFICE_OPENED', expect.objectContaining({ documentId: 'd1' }));
    });

    it('falls back to OneDrive/Samnuan/{ownRef} when the linked folder refuses the caller', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(baseDoc);
      mockCaseDrive.findLink.mockResolvedValue({ driveId: 'b!drv', externalId: 'FOLDER' });
      mockDrive.upload
        .mockRejectedValueOnce(new GraphApiError(403, 'denied'))
        .mockResolvedValueOnce({ ...uploaded, parentReference: { driveId: 'b!me' } });
      mockDrive.ensureFolderPath.mockResolvedValue({ id: 'SAM' });

      await service.open(user, 'c1', 'd1');

      expect(mockDrive.ensureFolderPath).toHaveBeenCalledWith('tok-me', ['Samnuan', '2569/0012']);
      expect(mockDrive.upload.mock.calls[1].slice(0, 3)).toEqual(['tok-me', 'me', 'SAM']);
      expect(mockPrisma.documentOfficeLink.upsert.mock.calls[0][0].create.driveId).toBe('b!me');
    });

    it('reuses the existing copy when the system version did not change', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue('tok-a');

      await expect(service.open(user, 'c1', 'd1')).resolves.toEqual({ webUrl: 'https://word/IT' });
      expect(mockDrive.upload).not.toHaveBeenCalled();
      expect(mockDrive.replaceContent).not.toHaveBeenCalled();
    });

    it('pushes a newer system version into the same item when Office has no unpulled edits', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, version: 3, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue('tok-a');
      mockDrive.getItem.mockResolvedValue({ lastModifiedDateTime: '2026-10-13T07:59:00Z' });
      mockDrive.replaceContent.mockResolvedValue({ id: 'IT', webUrl: 'https://word/IT', lastModifiedDateTime: '2026-10-13T09:00:00Z' });

      await service.open(user, 'c1', 'd1');

      expect(mockDrive.replaceContent).toHaveBeenCalledWith('tok-a', 'b!drv', 'IT', Buffer.from('docx-bytes'), DOCX);
      expect(mockPrisma.documentOfficeLink.update.mock.calls[0][0].data).toMatchObject({ uploadedVersion: 3 });
    });

    it('refuses to overwrite unpulled Office edits when the system also has a newer version', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, version: 3, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue('tok-a');
      mockDrive.getItem.mockResolvedValue({ lastModifiedDateTime: '2026-10-13T09:30:00Z' });

      await expect(service.open(user, 'c1', 'd1')).rejects.toBeInstanceOf(ConflictException);
      expect(mockDrive.replaceContent).not.toHaveBeenCalled();
    });

    it('starts a fresh copy when the uploader disconnected', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue(null);
      mockCaseDrive.findLink.mockResolvedValue(null);
      mockDrive.ensureFolderPath.mockResolvedValue({ id: 'SAM' });
      mockDrive.upload.mockResolvedValue({ ...uploaded, parentReference: { driveId: 'b!me' } });

      await expect(service.open(user, 'c1', 'd1')).resolves.toEqual({ webUrl: 'https://word/NEW' });
      expect(mockPrisma.documentOfficeLink.upsert.mock.calls[0][0].update).toMatchObject({ connectionId: 'conn-me', itemId: 'NEW' });
    });
  });

  describe('pull', () => {
    it('does nothing when Office has no edits after the last sync', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue('tok-a');
      mockDrive.getItem.mockResolvedValue({ lastModifiedDateTime: '2026-10-13T07:00:00Z' });

      await expect(service.pull(user, 'c1', 'd1')).resolves.toEqual({ updated: false, version: 2 });
      expect(mockDrive.downloadContent).not.toHaveBeenCalled();
    });

    it('creates a new version through uploadNewVersion and keeps a Thai filename', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue('tok-a');
      mockDrive.getItem.mockResolvedValue({ lastModifiedDateTime: '2026-10-13T09:00:00Z' });
      mockDrive.downloadContent.mockResolvedValue(Buffer.from('edited'));
      mockDocuments.uploadNewVersion.mockResolvedValue({ id: 'd1', version: 3 });

      await expect(service.pull(user, 'c1', 'd1')).resolves.toEqual({ updated: true, version: 3 });

      const [, caseId, documentId, file, notes] = mockDocuments.uploadNewVersion.mock.calls[0];
      expect([caseId, documentId]).toEqual(['c1', 'd1']);
      expect(decodeUploadFilename(file.originalname)).toBe('สัญญาเช่า.docx');
      expect(file.buffer).toEqual(Buffer.from('edited'));
      expect(file.mimetype).toBe(DOCX);
      expect(notes).toBe('ดึงจาก Office ออนไลน์');
      const data = mockPrisma.documentOfficeLink.update.mock.calls[0][0].data;
      expect(data.uploadedVersion).toBe(3);
      expect(data.updatedAt.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-10-13T09:00:00Z'));
      expect(mockCaseDrive.audit).toHaveBeenCalledWith(user, 'DOCUMENT_OFFICE_PULLED', expect.objectContaining({ version: 3 }));
    });

    it('explains when the uploader disconnected', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ ...baseDoc, officeLink });
      mockCaseDrive.tokenForConnection.mockResolvedValue(null);
      await expect(service.pull(user, 'c1', 'd1')).rejects.toThrow(/ตัดการเชื่อมต่อแล้ว/);
    });
  });

  it('listForCase flags unpulled edits and disconnected uploaders', async () => {
    mockPrisma.documentOfficeLink.findMany.mockResolvedValue([
      { ...officeLink, documentId: 'd1' },
      { ...officeLink, id: 'ol2', documentId: 'd2', connectionId: 'conn-gone' },
    ]);
    mockCaseDrive.tokenForConnection.mockImplementation(async (id: string) => (id === 'conn-a' ? 'tok-a' : null));
    mockDrive.getItem.mockResolvedValue({ lastModifiedDateTime: '2026-10-13T09:00:00Z' });

    const views = await service.listForCase('c1');

    expect(mockPrisma.documentOfficeLink.findMany).toHaveBeenCalledWith({ where: { document: { caseId: 'c1' } } });
    expect(views[0]).toMatchObject({ documentId: 'd1', hasNewerEdits: true, lastModifiedDateTime: '2026-10-13T09:00:00Z', error: null });
    expect(views[1]).toMatchObject({ documentId: 'd2', hasNewerEdits: false, lastModifiedDateTime: null });
    expect(views[1].error).toMatch(/ตัดการเชื่อมต่อแล้ว/);
  });
});

describe('syncStamp', () => {
  it('takes the later of our clock and Microsoft’s', () => {
    const now = new Date('2026-10-13T08:00:00Z');
    expect(syncStamp({ lastModifiedDateTime: '2026-10-13T08:00:05Z' }, now).toISOString()).toBe('2026-10-13T08:00:05.000Z');
    expect(syncStamp({ lastModifiedDateTime: '2026-10-13T07:00:00Z' }, now)).toEqual(now);
  });
});
