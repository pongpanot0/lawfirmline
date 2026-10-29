import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OutlookSyncService } from './outlook-sync.service';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { Prisma } from '../generated/prisma';
import { CaseEmailNotifier } from './case-email-notifier.service';
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
  const mockNotifier = { notifyBatch: jest.fn() };
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
        { provide: CaseEmailNotifier, useValue: mockNotifier },
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
    expect(out).toEqual({ threadId: 't1', messageId: 'm1', created: true, caseId: null });
    expect(mockPrisma.emailThread.create.mock.calls[0][0].data).toMatchObject({ mailboxConnectionId: 'c1', provider: 'microsoft', threadKey: 'conv-1' });
    expect(mockPrisma.emailMessage.create.mock.calls[0][0].data).toMatchObject({
      graphMessageId: 'g1', bodyHtml: '<p>เนื้อหาเต็ม</p>', bodyText: 'เนื้อหาเต็ม',
      toAddresses: ['lawyer@firm.com'], ccAddresses: ['cc@x.com'], direction: 'INBOUND',
    });
  });

  describe('new-mail alerts from the inbox drain', () => {
    const arrange = (deltaLink: string | null, receivedDateTime: string) => {
      mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({
        id: 'c1', firmId: 'f1', connectedByUserId: 'owner', deltaLink, syncInboxToIntake: true, sentDeltaLink: 'sd',
      });
      mockConnections.getValidAccessToken.mockResolvedValue('tok');
      mockGraph.getFolderDelta
        .mockResolvedValueOnce({ messages: [{ ...htmlMessage, receivedDateTime }], nextDeltaLink: 'n', nextSkipLink: null })
        .mockResolvedValueOnce({ messages: [], nextDeltaLink: 'n2', nextSkipLink: null });
      mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: 'case-1', subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2099-01-01') });
      mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
      mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
    };

    it('notifies once per case for fresh new mail after the first sync', async () => {
      arrange('prev', new Date().toISOString());
      await service.syncConnection('c1');
      expect(mockNotifier.notifyBatch).toHaveBeenCalledTimes(1);
      const [batch, owner] = mockNotifier.notifyBatch.mock.calls[0];
      expect([...batch.keys()]).toEqual(['case-1']);
      expect(owner).toBe('owner');
    });

    it('stays silent on the first sync (no deltaLink)', async () => {
      arrange(null, new Date().toISOString());
      await service.syncConnection('c1');
      expect(mockNotifier.notifyBatch).not.toHaveBeenCalled();
    });

    it('stays silent for mail older than 24 hours', async () => {
      arrange('prev', new Date(Date.now() - 25 * 3600_000).toISOString());
      await service.syncConnection('c1');
      expect(mockNotifier.notifyBatch).not.toHaveBeenCalled();
    });
  });

  it('reports created:false and the thread case for a message that already exists', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: 'case-9', subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-old' });
    const out = await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(out).toEqual({ threadId: 't1', messageId: 'm-old', created: false, caseId: 'case-9' });
  });

  describe('a conversation shared with a colleague’s mailbox', () => {
    const upsert = (extra: object = {}) =>
      service.upsertGraphMessage({
        firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
        direction: 'INBOUND', createThreadIfMissing: true, ...extra,
      });
    beforeEach(() => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
      mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
      mockPrisma.emailThread.create.mockResolvedValue({ id: 't-own', caseId: null });
    });

    it('never writes into the colleague’s private thread — keeps a per-mailbox copy', async () => {
      mockPrisma.emailThread.findUnique
        .mockResolvedValueOnce({ id: 't-b', caseId: null, intakeId: null, mailboxConnectionId: 'c-b' })
        .mockResolvedValueOnce(null);
      const out = await upsert();
      expect(mockPrisma.emailThread.findUnique.mock.calls[1][0].where.firmId_provider_threadKey.threadKey).toBe('conv-1:c1');
      expect(mockPrisma.emailThread.create.mock.calls[0][0].data).toMatchObject({ threadKey: 'conv-1:c1', mailboxConnectionId: 'c1' });
      expect(out?.threadId).toBe('t-own');
    });

    it('a colleague’s intake thread, or an owner-less one, is not shared either', async () => {
      mockPrisma.emailThread.findUnique
        .mockResolvedValueOnce({ id: 't-b', caseId: null, intakeId: 'intake-1', mailboxConnectionId: 'c-b' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 't-orphan', caseId: null, intakeId: null, mailboxConnectionId: null })
        .mockResolvedValueOnce(null);
      expect((await upsert())?.threadId).toBe('t-own');
      expect((await upsert())?.threadId).toBe('t-own');
      expect(mockPrisma.emailThread.create.mock.calls.map((c: any[]) => c[0].data.threadKey)).toEqual(['conv-1:c1', 'conv-1:c1']);
    });

    it('losing a create race to a colleague’s mailbox re-checks ownership instead of joining their thread', async () => {
      mockPrisma.emailThread.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 't-b', caseId: null, intakeId: null, mailboxConnectionId: 'c-b' })
        .mockResolvedValueOnce(null);
      mockPrisma.emailThread.create
        .mockRejectedValueOnce({ code: 'P2002' })
        .mockResolvedValueOnce({ id: 't-own', caseId: null });
      const out = await upsert();
      expect(mockPrisma.emailThread.create.mock.calls.map((c: any[]) => c[0].data.threadKey)).toEqual(['conv-1', 'conv-1:c1']);
      expect(out?.threadId).toBe('t-own');
      expect(mockPrisma.emailThread.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't-b' } }));
    });

    it('still joins a case thread a colleague filed (folder sync), but not from the add-in', async () => {
      const filed = { id: 't-b', caseId: 'case-1', intakeId: null, mailboxConnectionId: 'c-b', subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2099-01-01') };
      mockPrisma.emailThread.findUnique.mockResolvedValueOnce(filed);
      expect((await upsert())?.threadId).toBe('t-b');

      mockPrisma.emailThread.findUnique.mockResolvedValueOnce(filed).mockResolvedValueOnce(null);
      expect((await upsert({ ownThreadsOnly: true }))?.threadId).toBe('t-own');
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

  it('does not re-link a thread a person manually unlinked', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null, caseUnlinkedAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-existing' });
    await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', caseId: 'case-1', createThreadIfMissing: true,
    });
    const data = mockPrisma.emailThread.update.mock.calls[0]?.[0].data ?? {};
    expect(data.caseId).toBeUndefined();
  });

  it('survives a concurrent thread create (P2002) by re-reading the winner', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't-win', caseId: null, mailboxConnectionId: 'c1', subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailThread.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'm1' });
    const out = await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: htmlMessage as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(out).toEqual({ threadId: 't-win', messageId: 'm1', created: true, caseId: null });
  });

  it('after a thread-create race (P2002) the re-read winner still gets the case link', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 't-win', caseId: null, mailboxConnectionId: 'c1', subject: 'ขอคำปรึกษา', lastMessageAt: new Date('2026-10-14') });
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

  it('stores a sender-chosen attachment name inside the message folder (no path climbing)', async () => {
    mockPrisma.emailThread.findUnique.mockResolvedValue({ id: 't1', caseId: null, subject: 'x', lastMessageAt: new Date('2026-10-14') });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm-existing' });
    mockPrisma.emailAttachment.count.mockResolvedValue(0);
    mockGraph.getAttachments.mockResolvedValue([
      { name: '../../../../etc/cron.d/x', contentType: 'text/plain', contentBytes: Buffer.from('x').toString('base64') },
      { name: '..', contentType: 'text/plain', contentBytes: Buffer.from('y').toString('base64') },
    ]);
    await service.upsertGraphMessage({
      firmId: 'f1', connectionId: 'c1', accessToken: 'tok', message: { ...htmlMessage, hasAttachments: true } as any,
      direction: 'INBOUND', createThreadIfMissing: true,
    });
    expect(mockFileStorage.put).toHaveBeenCalledWith('outlook/f1/m-existing/x', expect.any(Buffer), 'text/plain');
    expect(mockFileStorage.put).toHaveBeenCalledWith('outlook/f1/m-existing/attachment', expect.any(Buffer), 'text/plain');
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
    expect(out).toEqual({ threadId: 't1', messageId: 'm-win', created: false, caseId: null });
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
