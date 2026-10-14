import { Test, TestingModule } from '@nestjs/testing';
import { CaseFolderSyncService } from './case-folder-sync.service';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookConnectionsService } from './outlook-connections.service';
import { GraphApiError, OutlookGraphClient } from './outlook-graph.client';
import { OutlookSyncService } from './outlook-sync.service';

const message = (id: string, from = 'client@example.com') => ({
  id: `graph-${id}`,
  conversationId: `conv-${id}`,
  subject: `เรื่อง ${id}`,
  bodyPreview: null,
  from: { emailAddress: { address: from } },
  receivedDateTime: '2026-10-13T00:00:00.000Z',
  hasAttachments: false,
  internetMessageId: `<${id}@example.com>`,
});

describe('CaseFolderSyncService', () => {
  let service: CaseFolderSyncService;
  const mockPrisma = {
    caseExternalLink: { findUniqueOrThrow: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
  const mockConnections = { getValidAccessToken: jest.fn() };
  const mockGraph = { getFolderDelta: jest.fn() };
  const mockMailSync = { upsertGraphMessage: jest.fn() };
  const link = {
    id: 'link-1',
    firmId: 'firm-1',
    caseId: 'case-1',
    connectionId: 'conn-1',
    externalId: 'folder-1',
    displayPath: 'Inbox/คดี A',
    deltaLink: null as string | null,
    connection: { mailboxAddress: 'Lawyer@Firm.co.th' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.caseExternalLink.findUniqueOrThrow.mockResolvedValue(link);
    mockPrisma.caseExternalLink.update.mockResolvedValue({});
    mockConnections.getValidAccessToken.mockResolvedValue('token');
    mockMailSync.upsertGraphMessage.mockResolvedValue({ threadId: 't', messageId: 'm' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseFolderSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: OutlookGraphClient, useValue: mockGraph },
        { provide: OutlookSyncService, useValue: mockMailSync },
      ],
    }).compile();
    service = module.get(CaseFolderSyncService);
  });

  it('writes every folder message into the case and stores the delta link', async () => {
    mockGraph.getFolderDelta.mockResolvedValue({ messages: [message('a')], nextDeltaLink: 'delta-2', nextSkipLink: null });

    const result = await service.syncLink('link-1');

    expect(result).toEqual({ messagesSynced: 1 });
    expect(mockGraph.getFolderDelta).toHaveBeenCalledWith('token', 'folder-1', null);
    expect(mockMailSync.upsertGraphMessage).toHaveBeenCalledWith({
      firmId: 'firm-1',
      connectionId: 'conn-1',
      accessToken: 'token',
      message: expect.objectContaining({ id: 'graph-a' }),
      direction: 'INBOUND',
      caseId: 'case-1',
      createThreadIfMissing: true,
    });
    expect(mockPrisma.caseExternalLink.update).toHaveBeenCalledWith({ where: { id: 'link-1' }, data: { deltaLink: 'delta-2' } });
    expect(mockPrisma.caseExternalLink.update).toHaveBeenLastCalledWith({
      where: { id: 'link-1' },
      data: { lastSyncedAt: expect.any(Date), lastError: null },
    });
  });

  it('backfills a large folder page by page, saving the cursor after each page', async () => {
    mockGraph.getFolderDelta
      .mockResolvedValueOnce({ messages: [message('a')], nextDeltaLink: null, nextSkipLink: 'skip-1' })
      .mockResolvedValueOnce({ messages: [message('b')], nextDeltaLink: 'delta-final', nextSkipLink: null });

    const result = await service.syncLink('link-1');

    expect(result.messagesSynced).toBe(2);
    expect(mockGraph.getFolderDelta).toHaveBeenNthCalledWith(2, 'token', 'folder-1', 'skip-1');
    const cursors = mockPrisma.caseExternalLink.update.mock.calls
      .map(([arg]) => arg.data.deltaLink)
      .filter((v) => v !== undefined);
    expect(cursors).toEqual(['skip-1', 'delta-final']);
  });

  it('marks mail sent from the linked mailbox as OUTBOUND and skips @removed entries', async () => {
    mockGraph.getFolderDelta.mockResolvedValue({
      messages: [message('a', 'lawyer@firm.co.th'), { id: 'gone', '@removed': { reason: 'deleted' } }],
      nextDeltaLink: 'd',
      nextSkipLink: null,
    });

    const result = await service.syncLink('link-1');

    expect(mockMailSync.upsertGraphMessage).toHaveBeenCalledTimes(1);
    expect(mockMailSync.upsertGraphMessage).toHaveBeenCalledWith(expect.objectContaining({ direction: 'OUTBOUND' }));
    expect(result.messagesSynced).toBe(1);
  });

  it('restarts from scratch once when Graph says the delta token expired (410)', async () => {
    mockPrisma.caseExternalLink.findUniqueOrThrow.mockResolvedValue({ ...link, deltaLink: 'old-delta' });
    mockGraph.getFolderDelta
      .mockRejectedValueOnce(new GraphApiError(410, 'syncStateNotFound'))
      .mockResolvedValueOnce({ messages: [], nextDeltaLink: 'fresh', nextSkipLink: null });

    await service.syncLink('link-1');

    expect(mockGraph.getFolderDelta).toHaveBeenNthCalledWith(1, 'token', 'folder-1', 'old-delta');
    expect(mockGraph.getFolderDelta).toHaveBeenNthCalledWith(2, 'token', 'folder-1', null);
    expect(mockPrisma.caseExternalLink.update).toHaveBeenCalledWith({ where: { id: 'link-1' }, data: { deltaLink: 'fresh' } });
  });

  it('records a Thai lastError when the folder is gone (404) and rethrows', async () => {
    mockGraph.getFolderDelta.mockRejectedValue(new GraphApiError(404, 'ErrorItemNotFound'));

    await expect(service.syncLink('link-1')).rejects.toBeInstanceOf(GraphApiError);
    expect(mockPrisma.caseExternalLink.update).toHaveBeenCalledWith({
      where: { id: 'link-1' },
      data: { lastError: expect.stringContaining('ไม่พบ folder นี้ใน Outlook') },
    });
  });

  it('syncAllLinks only takes ACTIVE connections on live cases and keeps going after one link fails', async () => {
    mockPrisma.caseExternalLink.findMany.mockResolvedValue([{ id: 'bad' }, { id: 'link-1' }]);
    mockPrisma.caseExternalLink.findUniqueOrThrow.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ ...link, id: where.id }),
    );
    mockGraph.getFolderDelta
      .mockRejectedValueOnce(new GraphApiError(404, 'x'))
      .mockResolvedValueOnce({ messages: [], nextDeltaLink: 'd', nextSkipLink: null });

    await service.syncAllLinks();

    expect(mockPrisma.caseExternalLink.findMany).toHaveBeenCalledWith({
      where: { kind: 'OUTLOOK_FOLDER', connection: { status: 'ACTIVE' }, case: { deletedAt: null } },
      select: { id: true },
    });
    expect(mockGraph.getFolderDelta).toHaveBeenCalledTimes(2);
  });

  it('ignores a second sync of the same link while one is still running', async () => {
    let release!: (value: unknown) => void;
    mockGraph.getFolderDelta.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const first = service.syncLink('link-1');
    const second = await service.syncLink('link-1');
    expect(second).toEqual({ messagesSynced: 0 });

    release({ messages: [], nextDeltaLink: 'd', nextSkipLink: null });
    await first;
    expect(mockGraph.getFolderDelta).toHaveBeenCalledTimes(1);
  });

  it('syncCase reports per-folder errors instead of failing the whole request', async () => {
    mockPrisma.caseExternalLink.findMany.mockResolvedValue([{ id: 'link-1', displayPath: 'Inbox/คดี A' }]);
    mockGraph.getFolderDelta.mockRejectedValue(new GraphApiError(404, 'x'));

    const result = await service.syncCase('case-1');

    expect(result.messagesSynced).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Inbox/คดี A');
    expect(mockPrisma.caseExternalLink.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1', kind: 'OUTLOOK_FOLDER', connection: { status: 'ACTIVE' } },
      select: { id: true, displayPath: true },
    });
  });
});
