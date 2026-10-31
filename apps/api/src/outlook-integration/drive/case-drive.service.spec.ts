import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { DocumentsService } from '../../documents/documents.service';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { GraphDriveClient } from '../graph/graph-drive.client';
import { GraphApiError } from '../graph/graph-http';
import { CaseAccessService } from '../../common/services/case-access.service';
import { CaseDriveService, DRIVE_IMPORT_MAX_BYTES, driveDisplayPath, toPickerItem } from './case-drive.service';

describe('CaseDriveService', () => {
  let service: CaseDriveService;
  const mockPrisma: any = {
    caseExternalLink: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    mailboxConnection: { findUnique: jest.fn() },
    case: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(mockPrisma)),
  };
  const mockConnections = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn() };
  const mockDrive = {
    getItem: jest.fn(),
    createFolder: jest.fn(),
    listChildren: jest.fn(),
    downloadContent: jest.fn(),
    sharedWithMe: jest.fn(),
    searchSites: jest.fn(),
    listSiteDrives: jest.fn(),
  };
  const mockDocuments = { createFromBuffer: jest.fn() };
  const user = { id: 'u1', firmId: 'f1', firmRole: 'LAWYER', firstName: 'สมชาย', lastName: 'ใจดี' } as unknown as AuthUser;
  const link = {
    id: 'link-1',
    caseId: 'c1',
    connectionId: 'conn-a',
    kind: 'DRIVE_FOLDER',
    externalId: 'FOLDER',
    driveId: 'b!drv',
    displayPath: 'Cases/ACME',
    linkedById: 'u2',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CaseDriveService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: GraphDriveClient, useValue: mockDrive },
        { provide: DocumentsService, useValue: mockDocuments },
        { provide: CaseAccessService, useValue: { getCaseFilterForUser: jest.fn(() => ({ firmId: 'f1' })) } },
      ],
    }).compile();
    service = module.get(CaseDriveService);
  });

  const activeLink = () => {
    mockPrisma.caseExternalLink.findFirst.mockResolvedValue(link);
    mockPrisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    mockConnections.getValidAccessToken.mockResolvedValue('tok-a');
  };

  describe('createAndLinkFolder', () => {
    beforeEach(() => {
      mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-me' });
      mockConnections.getValidAccessToken.mockResolvedValue('tok-me');
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(null);
      mockPrisma.caseExternalLink.findUnique.mockResolvedValue(null);
      mockPrisma.caseExternalLink.create.mockImplementation(({ data }: any) => ({ id: 'link-new', ...data }));
    });

    it('creates the folder in the chosen parent, then links it to the case', async () => {
      const created = { id: 'NEWF', name: 'TSB-1 - คดี', folder: {}, parentReference: { driveId: 'b!me', path: '/drive/root:/Cases' } };
      mockDrive.createFolder.mockResolvedValue(created);
      mockDrive.getItem.mockResolvedValue(created);

      const linkResult = await service.createAndLinkFolder(user, 'c1', { driveId: 'b!me', parentId: 'PARENT', name: 'TSB-1 - คดี' });

      expect(mockDrive.createFolder).toHaveBeenCalledWith('tok-me', 'b!me', 'PARENT', 'TSB-1 - คดี');
      expect(mockDrive.getItem).toHaveBeenCalledWith('tok-me', 'b!me', 'NEWF');
      expect(linkResult).toMatchObject({ caseId: 'c1', externalId: 'NEWF', driveId: 'b!me', displayPath: 'Cases/TSB-1 - คดี' });
    });

    it('creates nothing without a Microsoft connection', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);
      await expect(service.createAndLinkFolder(user, 'c1', { driveId: 'me', parentId: 'root', name: 'x' })).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDrive.createFolder).not.toHaveBeenCalled();
    });

    it('creates nothing when the case already has a folder', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue({ id: 'link-1', linkedById: 'u1', connection: { userId: 'u1' } });
      await expect(service.createAndLinkFolder(user, 'c1', { driveId: 'me', parentId: 'root', name: 'x' })).rejects.toBeInstanceOf(ConflictException);
      expect(mockDrive.createFolder).not.toHaveBeenCalled();
    });
  });

  describe('linkFolder', () => {
    beforeEach(() => {
      mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-me' });
      mockConnections.getValidAccessToken.mockResolvedValue('tok-me');
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(null);
    });

    it('needs the caller to have connected Microsoft', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);
      await expect(service.linkFolder(user, 'c1', { driveId: 'me', itemId: 'F1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a file', async () => {
      mockDrive.getItem.mockResolvedValue({ id: 'F1', name: 'a.pdf', file: {}, parentReference: { driveId: 'b!me' } });
      await expect(service.linkFolder(user, 'c1', { driveId: 'me', itemId: 'F1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a folder a colleague already linked to another case (firm-wide)', async () => {
      mockDrive.getItem.mockResolvedValue({ id: 'F1', name: 'ACME', folder: {}, parentReference: { driveId: 'b!me' } });
      mockPrisma.caseExternalLink.findFirst.mockResolvedValueOnce({ caseId: 'other' });
      await expect(service.linkFolder(user, 'c1', { driveId: 'me', itemId: 'F1' })).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.caseExternalLink.findFirst).toHaveBeenCalledWith({
        where: { firmId: 'f1', kind: 'DRIVE_FOLDER', driveId: 'b!me', externalId: 'F1' },
        select: { caseId: true },
      });
    });

    it('refuses to replace a folder linked by someone else', async () => {
      mockDrive.getItem.mockResolvedValue({ id: 'F1', name: 'ACME', folder: {}, parentReference: { driveId: 'b!me' } });
      mockPrisma.caseExternalLink.findUnique.mockResolvedValue(null);
      mockPrisma.caseExternalLink.findFirst
        .mockResolvedValueOnce(null) // the folder itself is free
        .mockResolvedValueOnce({ id: 'link-1', linkedById: 'u2', connection: { userId: 'u2' } }); // the case's current folder
      await expect(service.linkFolder(user, 'c1', { driveId: 'me', itemId: 'F1' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.caseExternalLink.deleteMany).not.toHaveBeenCalled();
    });

    it('turns a concurrent duplicate (P2002) into a 409', async () => {
      mockDrive.getItem.mockResolvedValue({ id: 'F1', name: 'ACME', folder: {}, parentReference: { driveId: 'b!me', path: '/drive/root:/Cases' } });
      mockPrisma.caseExternalLink.findUnique.mockResolvedValue(null);
      mockPrisma.caseExternalLink.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.linkFolder(user, 'c1', { driveId: 'me', itemId: 'F1' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('replaces the case’s previous drive folder and stores the real drive id', async () => {
      mockDrive.getItem.mockResolvedValue({
        id: 'F1',
        name: 'ACME',
        folder: {},
        parentReference: { driveId: 'b!me', path: '/drive/root:/Cases' },
      });
      mockPrisma.caseExternalLink.findUnique.mockResolvedValue(null);
      mockPrisma.caseExternalLink.create.mockImplementation(({ data }: any) => ({ id: 'new', ...data }));

      await service.linkFolder(user, 'c1', { driveId: 'me', itemId: 'F1' });

      expect(mockPrisma.caseExternalLink.deleteMany).toHaveBeenCalledWith({ where: { caseId: 'c1', kind: 'DRIVE_FOLDER' } });
      expect(mockPrisma.caseExternalLink.create).toHaveBeenCalledWith({
        data: {
          firmId: 'f1',
          caseId: 'c1',
          connectionId: 'conn-me',
          kind: 'DRIVE_FOLDER',
          externalId: 'F1',
          driveId: 'b!me',
          displayPath: 'Cases/ACME',
          linkedById: 'u1',
        },
      });
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DRIVE_FOLDER_LINKED');
    });
  });

  describe('unlinkFolder', () => {
    it('refuses someone who neither linked it, owns the mailbox, nor administers the firm', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue({ id: 'link-1', linkedById: 'u2', connection: { userId: 'u3' } });
      await expect(service.unlinkFolder(user, 'c1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.caseExternalLink.deleteMany).not.toHaveBeenCalled();
    });

    it('lets the linker unlink and audits it', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue({ id: 'link-1', linkedById: 'u1', connection: { userId: 'u1' } });
      mockPrisma.caseExternalLink.deleteMany.mockResolvedValue({ count: 1 });
      await expect(service.unlinkFolder(user, 'c1')).resolves.toEqual({ unlinked: true });
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DRIVE_FOLDER_UNLINKED');
    });
  });

  describe('listCaseFolder', () => {
    it('reports NO_LINK without calling Graph', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(null);
      await expect(service.listCaseFolder(user, 'c1')).resolves.toMatchObject({ state: 'NO_LINK', items: [] });
      expect(mockDrive.listChildren).not.toHaveBeenCalled();
    });

    it('reports DISCONNECTED when the linker revoked their connection', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(link);
      mockPrisma.user.findUnique.mockResolvedValue({ firstName: 'สมหญิง', lastName: 'ทนาย' });
      mockPrisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'REVOKED' });

      const listing = await service.listCaseFolder(user, 'c1');

      expect(listing.state).toBe('DISCONNECTED');
      expect(listing.message).toContain('ผู้ผูก folder ตัดการเชื่อมต่อแล้ว');
      expect(listing.link).toMatchObject({ linkedBy: 'สมหญิง ทนาย', isMine: false });
      expect(mockDrive.listChildren).not.toHaveBeenCalled();
    });

    it('reports DISCONNECTED when the token refresh fails', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(link);
      mockPrisma.mailboxConnection.findUnique.mockResolvedValue({ status: 'ACTIVE' });
      mockConnections.getValidAccessToken.mockRejectedValue(new BadRequestException('expired'));
      await expect(service.listCaseFolder(user, 'c1')).resolves.toMatchObject({ state: 'DISCONNECTED' });
    });

    it('lists live with the linker’s token and audits the view', async () => {
      activeLink();
      mockDrive.listChildren.mockResolvedValue([
        { id: 'IT', name: 'คำฟ้อง.docx', size: 10, webUrl: 'https://w/IT', lastModifiedDateTime: '2026-10-13T00:00:00Z', file: { mimeType: 'x' } },
      ]);

      const listing = await service.listCaseFolder(user, 'c1');

      expect(mockDrive.listChildren).toHaveBeenCalledWith('tok-a', 'b!drv', 'FOLDER');
      expect(listing.state).toBe('OK');
      expect(listing.items[0]).toMatchObject({ id: 'IT', isFolder: false, size: 10, mimeType: 'x' });
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'DRIVE_FOLDER_VIEWED', userId: 'u1' });
    });

    it('turns a Graph 403 into ERROR with Thai guidance', async () => {
      activeLink();
      mockDrive.listChildren.mockRejectedValue(new GraphApiError(403, 'denied'));
      const listing = await service.listCaseFolder(user, 'c1');
      expect(listing.state).toBe('ERROR');
      expect(listing.message).toMatch(/ไม่มีสิทธิ์/);
    });
  });

  describe('openItem / importItem', () => {
    it('refuses an item outside the linked folder before downloading anything', async () => {
      activeLink();
      mockDrive.getItem.mockResolvedValue({ id: 'SECRET', name: 'payroll.xlsx', file: {}, parentReference: { id: 'ELSEWHERE' } });

      await expect(service.importItem(user, 'c1', 'SECRET')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.openItem(user, 'c1', 'SECRET')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockDrive.downloadContent).not.toHaveBeenCalled();
      expect(mockDocuments.createFromBuffer).not.toHaveBeenCalled();
    });

    it('imports a file of the linked folder as a case document and audits it', async () => {
      activeLink();
      mockDrive.getItem.mockResolvedValue({
        id: 'IT',
        name: 'คำฟ้อง.pdf',
        size: 3,
        file: { mimeType: 'application/pdf' },
        parentReference: { id: 'FOLDER' },
      });
      mockDrive.downloadContent.mockResolvedValue(Buffer.from('pdf'));
      mockDocuments.createFromBuffer.mockResolvedValue({ id: 'doc-1' });

      await service.importItem(user, 'c1', 'IT');

      expect(mockDocuments.createFromBuffer).toHaveBeenCalledWith(user, 'c1', {
        filename: 'คำฟ้อง.pdf',
        buffer: Buffer.from('pdf'),
        mimeType: 'application/pdf',
      });
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DRIVE_FILE_IMPORTED');
    });

    it('refuses to import a file over 100 MB', async () => {
      activeLink();
      mockDrive.getItem.mockResolvedValue({ id: 'IT', name: 'scan.pdf', size: DRIVE_IMPORT_MAX_BYTES + 1, file: {}, parentReference: { id: 'FOLDER' } });
      await expect(service.importItem(user, 'c1', 'IT')).rejects.toBeInstanceOf(BadRequestException);
      expect(mockDrive.downloadContent).not.toHaveBeenCalled();
    });

    it('opens a file of the linked folder and returns its webUrl', async () => {
      activeLink();
      mockDrive.getItem.mockResolvedValue({ id: 'IT', name: 'a.docx', webUrl: 'https://w/IT', file: {}, parentReference: { id: 'FOLDER' } });
      await expect(service.openItem(user, 'c1', 'IT')).resolves.toEqual({ webUrl: 'https://w/IT' });
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.action).toBe('DRIVE_FILE_OPENED');
    });
  });

  it('importAll refuses a second run for the same case while one is in flight', async () => {
    activeLink();
    let release!: (items: unknown[]) => void;
    mockDrive.listChildren.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const first = service.importAll(user, 'c1');
    await expect(service.importAll(user, 'c1')).rejects.toThrow('กำลังนำเข้า');
    release([]);
    await expect(first).resolves.toEqual({ imported: 0, skipped: [] });
  });

  it('importAll skips folders and oversize files', async () => {
    activeLink();
    mockDrive.listChildren.mockResolvedValue([
      { id: 'D', name: 'sub', folder: {} },
      { id: 'A', name: 'a.pdf', size: 1, file: { mimeType: 'application/pdf' } },
      { id: 'B', name: 'huge.mp4', size: DRIVE_IMPORT_MAX_BYTES + 1, file: {} },
    ]);
    mockDrive.downloadContent.mockResolvedValue(Buffer.from('a'));
    mockDocuments.createFromBuffer.mockResolvedValue({ id: 'doc-a' });

    await expect(service.importAll(user, 'c1')).resolves.toEqual({ imported: 1, skipped: ['huge.mp4'] });
    expect(mockDrive.downloadContent).toHaveBeenCalledTimes(1);
  });

  it('picker lists only folders, resolving shared items to their own drive', async () => {
    mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-me' });
    mockConnections.getValidAccessToken.mockResolvedValue('tok-me');
    mockDrive.sharedWithMe.mockResolvedValue([
      { id: 'local', name: 'คดีแชร์', webUrl: 'w', remoteItem: { id: 'R1', name: 'คดีแชร์', webUrl: 'rw', folder: {}, parentReference: { driveId: 'b!other' } } },
      { id: 'local2', name: 'file.docx', webUrl: 'w', remoteItem: { id: 'R2', name: 'file.docx', webUrl: 'rw', file: {}, parentReference: { driveId: 'b!other' } } },
    ]);
    await expect(service.pickerShared(user)).resolves.toEqual([{ id: 'R1', driveId: 'b!other', name: 'คดีแชร์', webUrl: 'rw' }]);
  });
  describe('folderSuggestions', () => {
    it('suggests a case for a folder named after its ownRef and reports already-linked folders', async () => {
      mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-me' });
      mockConnections.getValidAccessToken.mockResolvedValue('tok-me');
      mockDrive.listChildren.mockResolvedValue([
        { id: 'F1', name: 'ACME 2569/0012', webUrl: 'w1', folder: {}, parentReference: { driveId: 'b!d' } },
        { id: 'F2', name: 'ACME 2569/0099', webUrl: 'w2', folder: {}, parentReference: { driveId: 'b!d' } },
      ]);
      mockPrisma.case.findMany.mockResolvedValue([
        { id: 'c1', ownRef: 'ACME 2569/0012', title: 'A', clientName: null, blackCaseNumber: null, redCaseNumber: null, proceedings: [], client: { name: 'ACME' } },
        { id: 'c2', ownRef: 'ACME 2569/0099', title: 'B', clientName: null, blackCaseNumber: null, redCaseNumber: null, proceedings: [], client: { name: 'ACME' } },
      ]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([
        { id: 'l2', externalId: 'F2', caseId: 'c2', case: { ownRef: 'ACME 2569/0099', title: 'B' } },
      ]);

      const rows = await service.folderSuggestions(user, 'b!d', 'ROOT');

      expect(rows[0].link).toBeNull();
      expect(rows[0].suggestions[0].caseId).toBe('c1');
      expect(rows[1].link).toEqual({ id: 'l2', caseId: 'c2', ownRef: 'ACME 2569/0099', title: 'B' });
      expect(rows[1].suggestions).toEqual([]);
    });

    it('returns parsed for unlinked rows and finds links firm-wide', async () => {
      mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-me' });
      mockConnections.getValidAccessToken.mockResolvedValue('tok-me');
      mockDrive.listChildren.mockResolvedValue([
        { id: 'F1', name: '86. คำฟ้อง - พE291.69 - ศจ.สมุทรปราการ (โบ)', webUrl: 'w1', folder: {}, parentReference: { driveId: 'b!d' } },
        { id: 'F2', name: '89. คำให้การ - พ264.69', webUrl: 'w2', folder: {}, parentReference: { driveId: 'b!d' } },
      ]);
      mockPrisma.case.findMany.mockResolvedValue([]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([
        { id: 'l2', externalId: 'F2', caseId: 'c2', case: { ownRef: 'TSB-2', title: 'B' } },
      ]);

      const rows = await service.folderSuggestions(user, 'b!d', 'ROOT');

      expect(mockPrisma.caseExternalLink.findMany.mock.calls[0][0].where).toEqual({
        firmId: 'f1',
        kind: 'DRIVE_FOLDER',
        externalId: { in: ['F1', 'F2'] },
      });
      expect(rows[0].parsed).toMatchObject({ blackCaseNumber: 'พE291/2569', courtName: 'ศจ.สมุทรปราการ', teamHint: 'โบ' });
      expect(rows[1].parsed).toBeNull();
    });

    it('hides the case behind a link the user may not see, but still marks the folder linked', async () => {
      mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-me' });
      mockConnections.getValidAccessToken.mockResolvedValue('tok-me');
      mockDrive.listChildren.mockResolvedValue([{ id: 'F9', name: '9. คดีลับ', webUrl: 'w', folder: {}, parentReference: { driveId: 'b!d' } }]);
      mockPrisma.case.findMany.mockResolvedValue([]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([
        { id: 'l9', externalId: 'F9', caseId: 'secret', case: { ownRef: 'TSB-9', title: 'คดีลับ' } },
      ]);

      const [row] = await service.folderSuggestions(user, 'b!d', 'ROOT');

      expect(row.link).toEqual({ id: 'l9', caseId: '', ownRef: '—', title: 'คดีที่คุณไม่มีสิทธิ์เข้าถึง' });
      expect(row.parsed).toBeNull();
    });
  });
});

describe('drive view helpers', () => {
  it('builds a readable path from parentReference.path', () => {
    expect(driveDisplayPath({ name: 'ACME', parentReference: { path: '/drive/root:/Cases' } } as any)).toBe('Cases/ACME');
    expect(driveDisplayPath({ name: 'Cases', parentReference: { path: '/drive/root:' } } as any)).toBe('Cases');
    expect(driveDisplayPath({ name: 'Shared' } as any)).toBe('Shared');
  });

  it('drops items without a drive id', () => {
    expect(toPickerItem({ id: 'x', name: 'x', webUrl: 'w', folder: {} } as any)).toBeNull();
  });});
