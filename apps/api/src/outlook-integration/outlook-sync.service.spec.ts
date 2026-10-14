import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OutlookSyncService } from './outlook-sync.service';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { Prisma } from '../generated/prisma';
import { FileStorageService } from '../common/services/file-storage.service';

describe('OutlookSyncService', () => {
  let service: OutlookSyncService;
  const mockPrisma = {
    mailboxConnection: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    emailThread: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    emailMessage: { findFirst: jest.fn(), create: jest.fn() },
    emailAttachment: { create: jest.fn(), count: jest.fn() },
  };
  const mockConnections = { getValidAccessToken: jest.fn() };
  const mockGraph = { getInboxDelta: jest.fn(), getFolderDelta: jest.fn(), getAttachments: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue('./test-uploads') };
  const mockFileStorage = { put: jest.fn().mockResolvedValue('outlook/test-uploads/attachment.bin') };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('./test-uploads');
    mockPrisma.emailAttachment.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: OutlookGraphClient, useValue: mockGraph },
        { provide: ConfigService, useValue: mockConfig },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(OutlookSyncService);
  });

  it('maps a Graph message into an EmailThread/EmailMessage keyed by conversationId/internetMessageId', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({
      id: 'conn-1',
      firmId: 'firm-1',
      deltaLink: null,
      syncInboxToIntake: true,
      sentDeltaLink: null,
    });
    mockConnections.getValidAccessToken.mockResolvedValue('access-token');
    mockGraph.getFolderDelta.mockResolvedValue({
      messages: [
        {
          id: 'graph-msg-1',
          conversationId: 'conv-1',
          subject: 'ขอคำปรึกษา',
          bodyPreview: 'เนื้อหาอีเมล',
          from: { emailAddress: { name: 'Somchai', address: 'somchai@example.com' } },
          receivedDateTime: '2026-09-09T00:00:00.000Z',
          hasAttachments: false,
          internetMessageId: '<msg-1@example.com>',
        },
      ],
      nextDeltaLink: 'https://graph.microsoft.com/delta?token=next',
      nextSkipLink: null,
    });
    mockPrisma.emailThread.findUnique.mockResolvedValue(null);
    mockPrisma.emailThread.create.mockResolvedValue({ id: 'thread-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'email-msg-1' });

    const result = await service.syncConnection('conn-1');

    expect(result.messagesSynced).toBe(1);
    expect(mockPrisma.emailThread.findUnique).toHaveBeenCalledWith({
      where: { firmId_provider_threadKey: { firmId: 'firm-1', provider: 'microsoft', threadKey: 'conv-1' } },
    });
    expect(mockPrisma.emailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threadId: 'thread-1', messageKey: '<msg-1@example.com>' }),
      }),
    );
    expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: {
        deltaLink: 'https://graph.microsoft.com/delta?token=next',
        sentDeltaLink: 'https://graph.microsoft.com/delta?token=next',
        lastSyncedAt: expect.any(Date),
      },
    });
  });

  it('does not create a duplicate EmailMessage for a message already synced (redelivered by delta)', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({ id: 'conn-1', firmId: 'firm-1', deltaLink: null, syncInboxToIntake: true, sentDeltaLink: null });
    mockConnections.getValidAccessToken.mockResolvedValue('access-token');
    mockGraph.getFolderDelta.mockResolvedValue({
      messages: [
        {
          id: 'graph-msg-1',
          conversationId: 'conv-1',
          subject: 'ขอคำปรึกษา',
          bodyPreview: null,
          receivedDateTime: '2026-09-09T00:00:00.000Z',
          hasAttachments: false,
          internetMessageId: '<already-synced@example.com>',
        },
      ],
      nextDeltaLink: 'https://graph.microsoft.com/delta?token=next',
      nextSkipLink: null,
    });
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 'thread-1', caseId: null });
    mockPrisma.emailThread.update.mockResolvedValue({ id: 'thread-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'existing-email-msg' });

    await service.syncConnection('conn-1');

    expect(mockPrisma.emailMessage.create).not.toHaveBeenCalled();
  });

  it('does not fetch attachments when the message has none', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({ id: 'conn-1', firmId: 'firm-1', deltaLink: null, syncInboxToIntake: true, sentDeltaLink: null });
    mockConnections.getValidAccessToken.mockResolvedValue('access-token');
    mockGraph.getFolderDelta.mockResolvedValue({
      messages: [
        {
          id: 'graph-msg-1',
          conversationId: 'conv-1',
          subject: 'x',
          bodyPreview: null,
          receivedDateTime: '2026-09-09T00:00:00.000Z',
          hasAttachments: false,
          internetMessageId: '<no-attachments@example.com>',
        },
      ],
      nextDeltaLink: null,
      nextSkipLink: null,
    });
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 'thread-1', caseId: null });
    mockPrisma.emailThread.update.mockResolvedValue({ id: 'thread-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'email-msg-1' });

    await service.syncConnection('conn-1');

    expect(mockGraph.getAttachments).not.toHaveBeenCalled();
  });

  const htmlMessage = {
    id: 'g1', conversationId: 'conv-1', subject: 'ขอคำปรึกษา', bodyPreview: 'ตัด…',
    body: { contentType: 'html', content: '<p>เนื้อหาเต็ม</p>' },
    from: { emailAddress: { name: 'S', address: 's@x.com' } },
    toRecipients: [{ emailAddress: { address: 'lawyer@firm.com' } }],
    ccRecipients: [{ emailAddress: { address: 'cc@x.com' } }],
    receivedDateTime: '2026-10-13T00:00:00Z', hasAttachments: false, internetMessageId: '<m1@x>',
  };

  it('syncConnection skips inbox when syncInboxToIntake is false but still reads Sent Items', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({ id: 'c1', firmId: 'f1', syncInboxToIntake: false, deltaLink: null, sentDeltaLink: null });
    mockConnections.getValidAccessToken.mockResolvedValue('tok');
    mockGraph.getFolderDelta.mockResolvedValue({ messages: [], nextDeltaLink: 'd2', nextSkipLink: null });
    await service.syncConnection('c1');
    expect(mockGraph.getFolderDelta).toHaveBeenCalledTimes(1);
    expect(mockGraph.getFolderDelta).toHaveBeenCalledWith('tok', 'sentitems', null);
    expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sentDeltaLink: 'd2' }) }));
  });

  it('upsertGraphMessage stores the full body, recipients, graph id and connection', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue(null);
    mockPrisma.emailThread.create.mockResolvedValue({ id: 't1', caseId: null });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
    const out = await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(out).toEqual({ threadId: 't1', messageId: 'm1' });
    expect(mockPrisma.emailThread.create.mock.calls[0][0].data).toMatchObject({ mailboxConnectionId: 'c1', provider: 'microsoft', threadKey: 'conv-1' });
    expect(mockPrisma.emailMessage.create.mock.calls[0][0].data).toMatchObject({
      graphMessageId: 'g1', bodyHtml: '<p>เนื้อหาเต็ม</p>', bodyText: 'เนื้อหาเต็ม',
      toAddresses: ['lawyer@firm.com'], ccAddresses: ['cc@x.com'], direction: 'INBOUND',
    });
  });

  it('Sent Items never create a thread', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue(null);
    const out = await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'OUTBOUND', createThreadIfMissing: false,
    });
    expect(out).toBeNull();
    expect(mockPrisma.emailThread.create).not.toHaveBeenCalled();
  });

  it('a caseId links an existing unlinked thread', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null });
    mockPrisma.emailThread.update.mockResolvedValue({ id: 't1', caseId: 'case-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-existing' });
    await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', caseId: 'case-1', createThreadIfMissing: true,
    });
    expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ caseId: 'case-1', status: 'LINKED' }),
    });
  });

  it('survives a concurrent thread create (P2002) by re-reading the winner', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't-win', caseId: null, subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailThread.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
    const out = await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(out).toEqual({ threadId: 't-win', messageId: 'm1' });
  });

  it('after a thread-create race (P2002) the re-read winner still gets the case link', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't-win', caseId: null, subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailThread.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    mockPrisma.emailThread.update.mockResolvedValue({ id: 't-win', caseId: 'case-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
    await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', caseId: 'case-1', createThreadIfMissing: true,
    });
    expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({
      where: { id: 't-win' },
      data: expect.objectContaining({ caseId: 'case-1', status: 'LINKED' }),
    });
  });

  it('re-syncs attachments of an already stored message that has none saved', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null, subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-existing' });
    mockPrisma.emailAttachment.count.mockResolvedValue(0);
    mockGraph.getAttachments.mockResolvedValue([{ name: 'a.pdf', contentType: 'application/pdf', contentBytes: Buffer.from('x').toString('base64') }]);
    await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: { ...htmlMessage, hasAttachments: true } as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(mockPrisma.emailAttachment.count).toHaveBeenCalledWith({ where: { messageId: 'm-existing' } });
    expect(mockGraph.getAttachments).toHaveBeenCalledWith('tok', 'g1');
    expect(mockPrisma.emailAttachment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ messageId: 'm-existing', filename: 'a.pdf' }) });
  });

  it('does not re-fetch attachments of a stored message that already has them', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null, subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-existing' });
    mockPrisma.emailAttachment.count.mockResolvedValue(2);
    await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: { ...htmlMessage, hasAttachments: true } as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(mockGraph.getAttachments).not.toHaveBeenCalled();
  });

  it('survives a concurrent message create (P2002) by returning the existing row', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null, subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'm-win' });
    mockPrisma.emailMessage.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    const out = await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(out).toEqual({ threadId: 't1', messageId: 'm-win' });
    expect(mockPrisma.emailThread.update).not.toHaveBeenCalled(); // nothing changed on the thread
  });

  it('rethrows non-unique errors from message create', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null, subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockRejectedValue(new Error('boom'));
    await expect(
      service.upsertGraphMessage({
        firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
        direction: 'INBOUND', createThreadIfMissing: true,
      }),
    ).rejects.toThrow('boom');
  });
});
