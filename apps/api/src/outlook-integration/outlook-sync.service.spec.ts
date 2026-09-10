import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OutlookSyncService } from './outlook-sync.service';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookGraphClient } from './outlook-graph.client';

describe('OutlookSyncService', () => {
  let service: OutlookSyncService;
  const mockPrisma = {
    mailboxConnection: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    emailThread: { upsert: jest.fn() },
    emailMessage: { findFirst: jest.fn(), create: jest.fn() },
    emailAttachment: { create: jest.fn() },
  };
  const mockConnections = { getValidAccessToken: jest.fn() };
  const mockGraph = { getInboxDelta: jest.fn(), getAttachments: jest.fn() };
  const mockConfig = { get: jest.fn().mockReturnValue('./test-uploads') };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfig.get.mockReturnValue('./test-uploads');
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookSyncService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: OutlookGraphClient, useValue: mockGraph },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(OutlookSyncService);
  });

  it('maps a Graph message into an EmailThread/EmailMessage keyed by conversationId/internetMessageId', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({
      id: 'conn-1',
      firmId: 'firm-1',
      deltaLink: null,
    });
    mockConnections.getValidAccessToken.mockResolvedValue('access-token');
    mockGraph.getInboxDelta.mockResolvedValue({
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
    mockPrisma.emailThread.upsert.mockResolvedValue({ id: 'thread-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'email-msg-1' });

    const result = await service.syncConnection('conn-1');

    expect(result.messagesSynced).toBe(1);
    expect(mockPrisma.emailThread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { firmId_provider_threadKey: { firmId: 'firm-1', provider: 'microsoft', threadKey: 'conv-1' } },
      }),
    );
    expect(mockPrisma.emailMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ threadId: 'thread-1', messageKey: '<msg-1@example.com>' }),
      }),
    );
    expect(mockPrisma.mailboxConnection.update).toHaveBeenCalledWith({
      where: { id: 'conn-1' },
      data: { deltaLink: 'https://graph.microsoft.com/delta?token=next', lastSyncedAt: expect.any(Date) },
    });
  });

  it('does not create a duplicate EmailMessage for a message already synced (redelivered by delta)', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({ id: 'conn-1', firmId: 'firm-1', deltaLink: null });
    mockConnections.getValidAccessToken.mockResolvedValue('access-token');
    mockGraph.getInboxDelta.mockResolvedValue({
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
    mockPrisma.emailThread.upsert.mockResolvedValue({ id: 'thread-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'existing-email-msg' });

    await service.syncConnection('conn-1');

    expect(mockPrisma.emailMessage.create).not.toHaveBeenCalled();
  });

  it('does not fetch attachments when the message has none', async () => {
    mockPrisma.mailboxConnection.findUniqueOrThrow.mockResolvedValue({ id: 'conn-1', firmId: 'firm-1', deltaLink: null });
    mockConnections.getValidAccessToken.mockResolvedValue('access-token');
    mockGraph.getInboxDelta.mockResolvedValue({
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
    mockPrisma.emailThread.upsert.mockResolvedValue({ id: 'thread-1' });
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    mockPrisma.emailMessage.create.mockResolvedValue({ id: 'email-msg-1' });

    await service.syncConnection('conn-1');

    expect(mockGraph.getAttachments).not.toHaveBeenCalled();
  });
});
