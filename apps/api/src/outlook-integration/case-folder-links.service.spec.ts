import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { CaseFolderLinksService } from './case-folder-links.service';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookConnectionsService } from './outlook-connections.service';
import { GraphMailFoldersClient } from './graph/graph-mail-folders.client';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFolderSyncService } from './case-folder-sync.service';

describe('CaseFolderLinksService', () => {
  let service: CaseFolderLinksService;
  const mockPrisma = {
    case: { findMany: jest.fn() },
    caseExternalLink: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const mockConnections = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn() };
  const mockFolders = { listMailFolders: jest.fn() };
  const mockCaseAccess = { getCaseFilterForUser: jest.fn(() => ({ firmId: 'firm-1' })) };
  const mockSync = { syncLink: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
  const folders = [
    { id: 'inbox', displayName: 'Inbox', displayPath: 'Inbox', isSystem: true },
    { id: 'f1', displayName: 'TSBREF20250001 เอบีซี', displayPath: 'Inbox/คดี/TSBREF20250001 เอบีซี', isSystem: false },
    { id: 'f2', displayName: 'TSBREF20250002', displayPath: 'Inbox/คดี/TSBREF20250002', isSystem: false },
  ];
  const caseRow = {
    id: 'case-1', ownRef: 'TSBREF20250001', title: 'ผิดสัญญา', clientName: null,
    blackCaseNumber: null, redCaseNumber: null, client: { name: 'บริษัท เอบีซี จำกัด' }, proceedings: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnections.findActiveForUser.mockResolvedValue({ id: 'conn-1' });
    mockConnections.getValidAccessToken.mockResolvedValue('token');
    mockFolders.listMailFolders.mockResolvedValue(folders);
    mockSync.syncLink.mockResolvedValue({ messagesSynced: 0 });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseFolderLinksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: GraphMailFoldersClient, useValue: mockFolders },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: CaseFolderSyncService, useValue: mockSync },
      ],
    }).compile();
    service = module.get(CaseFolderLinksService);
  });

  describe('listFolders', () => {
    it('requires the user to have their own Microsoft connection', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);
      await expect(service.listFolders(user)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hides system folders, suggests cases from the folder name, and shows existing links without suggestions', async () => {
      mockPrisma.case.findMany.mockResolvedValue([caseRow]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([
        { id: 'link-9', externalId: 'f2', caseId: 'case-2', case: { ownRef: 'TSBREF20250002', title: 'คดีสอง' } },
      ]);

      const rows = await service.listFolders(user);

      expect(rows.map((r) => r.folderId)).toEqual(['f1', 'f2']);
      expect(rows[0].suggestions[0]).toMatchObject({ caseId: 'case-1', reason: 'OWN_REF' });
      expect(rows[1]).toEqual({
        folderId: 'f2',
        displayPath: 'Inbox/คดี/TSBREF20250002',
        link: { id: 'link-9', caseId: 'case-2', ownRef: 'TSBREF20250002', title: 'คดีสอง' },
        suggestions: [],
      });
      expect(mockPrisma.case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'firm-1' } }));
    });
  });

  describe('linkFolders', () => {
    it('refuses a case the user cannot open — nothing is linked', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);
      await expect(service.linkFolders(user, [{ folderId: 'f1', caseId: 'case-x' }])).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.caseExternalLink.create).not.toHaveBeenCalled();
    });

    it('refuses a well-known folder', async () => {
      mockPrisma.case.findMany.mockResolvedValue([{ id: 'case-1' }]);
      await expect(service.linkFolders(user, [{ folderId: 'inbox', caseId: 'case-1' }])).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.caseExternalLink.create).not.toHaveBeenCalled();
    });

    it('refuses a folder that is already linked to another case', async () => {
      mockPrisma.case.findMany.mockResolvedValue([{ id: 'case-1' }]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([{ externalId: 'f1', caseId: 'case-2', displayPath: 'Inbox/คดี/x' }]);
      await expect(service.linkFolders(user, [{ folderId: 'f1', caseId: 'case-1' }])).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.caseExternalLink.create).not.toHaveBeenCalled();
    });

    it('treats re-linking a folder to the same case as a no-op', async () => {
      mockPrisma.case.findMany.mockResolvedValue([{ id: 'case-1' }]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([{ externalId: 'f1', caseId: 'case-1', displayPath: 'x' }]);
      await expect(service.linkFolders(user, [{ folderId: 'f1', caseId: 'case-1' }])).resolves.toEqual({ linked: [] });
      expect(mockPrisma.caseExternalLink.create).not.toHaveBeenCalled();
    });

    it('creates the link, audits it, and starts the backfill without waiting for it', async () => {
      mockPrisma.case.findMany.mockResolvedValue([{ id: 'case-1' }]);
      mockPrisma.caseExternalLink.findMany.mockResolvedValue([]);
      mockPrisma.caseExternalLink.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'link-new', ...data }),
      );
      mockSync.syncLink.mockReturnValue(new Promise(() => undefined)); // never settles

      const result = await service.linkFolders(user, [{ folderId: 'f1', caseId: 'case-1' }]);

      expect(mockPrisma.caseExternalLink.create).toHaveBeenCalledWith({
        data: {
          firmId: 'firm-1',
          caseId: 'case-1',
          connectionId: 'conn-1',
          kind: 'OUTLOOK_FOLDER',
          externalId: 'f1',
          displayPath: 'Inbox/คดี/TSBREF20250001 เอบีซี',
          linkedById: 'user-1',
        },
      });
      expect(mockPrisma.auditLog.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ firmId: 'firm-1', userId: 'user-1', action: 'CASE_FOLDER_LINKED' })],
      });
      expect(mockSync.syncLink).toHaveBeenCalledWith('link-new');
      expect(result).toEqual({
        linked: [{ id: 'link-new', caseId: 'case-1', externalId: 'f1', displayPath: 'Inbox/คดี/TSBREF20250001 เอบีซี' }],
      });
    });
  });

  describe('unlink', () => {
    const link = { id: 'link-1', caseId: 'case-1', displayPath: 'x', linkedById: 'someone', connection: { userId: 'someone' } };

    it('forbids a colleague who neither linked it nor owns the mailbox', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(link);
      await expect(service.unlink(user, 'link-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.caseExternalLink.delete).not.toHaveBeenCalled();
    });

    it('lets the firm owner unlink and audits it', async () => {
      mockPrisma.caseExternalLink.findFirst.mockResolvedValue(link);
      await expect(service.unlink({ ...user, firmRole: FirmRole.OWNER }, 'link-1')).resolves.toEqual({ unlinked: true });
      expect(mockPrisma.caseExternalLink.delete).toHaveBeenCalledWith({ where: { id: 'link-1' } });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'CASE_FOLDER_UNLINKED' }),
      });
    });
  });
});
