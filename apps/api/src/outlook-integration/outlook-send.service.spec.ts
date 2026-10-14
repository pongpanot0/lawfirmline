import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { GraphApiError, OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSendService, buildRecipientOptions } from './outlook-send.service';

describe('OutlookSendService', () => {
  let service: OutlookSendService;
  const mockPrisma = {
    case: { findFirst: jest.fn() },
    document: { findMany: jest.fn() },
    emailMessage: { findFirst: jest.fn() },
    auditLog: { findFirst: jest.fn(), create: jest.fn() },
  };
  const mockConnections = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn(), markError: jest.fn() };
  const mockGraph = {
    createDraftMessage: jest.fn(),
    createReplyDraft: jest.fn(),
    updateDraft: jest.fn(),
    addFileAttachment: jest.fn(),
    sendDraft: jest.fn(),
  };
  const mockSync = { upsertGraphMessage: jest.fn() };
  const mockStorage = { getBuffer: jest.fn() };

  const user = { id: 'user-1', firmId: 'firm-1', firstName: 'สมชาย', lastName: 'ใจดี', email: 'somchai@firm.test' } as unknown as AuthUser;
  const connection = { id: 'conn-1', userId: 'user-1', mailboxAddress: 'somchai@firm.test' };
  const draft = {
    id: 'draft-1',
    conversationId: 'conv-9',
    internetMessageId: '<d1@firm.test>',
    subject: '[TSB-1] นัดประชุม',
    bodyPreview: null,
    body: { contentType: 'html', content: '<div>x</div>' },
    receivedDateTime: '2026-10-13T00:00:00Z',
    hasAttachments: false,
  };
  const baseDto = {
    to: ['client@example.com'],
    subject: '[TSB-1] นัดประชุม',
    body: 'เรียนคุณลูกความ\nขอนัดประชุม',
    clientRequestId: '6f1c3c9e-1d2b-4c1a-9a51-0e0c3b6a7f10',
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockConnections.findActiveForUser.mockResolvedValue(connection);
    mockConnections.getValidAccessToken.mockResolvedValue('token-1');
    mockGraph.createDraftMessage.mockResolvedValue(draft);
    mockGraph.addFileAttachment.mockResolvedValue(undefined);
    mockGraph.sendDraft.mockResolvedValue(undefined);
    mockSync.upsertGraphMessage.mockResolvedValue({ threadId: 'thread-1', messageId: 'msg-1' });
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });
    mockPrisma.document.findMany.mockResolvedValue([]);

    const module = await Test.createTestingModule({
      providers: [
        OutlookSendService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: OutlookGraphClient, useValue: mockGraph },
        { provide: OutlookSyncService, useValue: mockSync },
        { provide: FileStorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(OutlookSendService);
  });

  describe('new email', () => {
    it('drafts, sends, records the message on the case and writes the audit log', async () => {
      const result = await service.send(user, 'case-1', baseDto);

      expect(result).toEqual({ mode: 'NEW', threadId: 'thread-1', recorded: true });
      expect(mockGraph.createDraftMessage).toHaveBeenCalledWith('token-1', {
        subject: '[TSB-1] นัดประชุม',
        body: { contentType: 'HTML', content: '<div>เรียนคุณลูกความ<br>ขอนัดประชุม</div>' },
        toRecipients: [{ emailAddress: { address: 'client@example.com' } }],
        ccRecipients: [],
      });
      expect(mockGraph.sendDraft).toHaveBeenCalledWith('token-1', 'draft-1');
      expect(mockSync.upsertGraphMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          firmId: 'firm-1',
          connectionId: 'conn-1',
          accessToken: 'token-1',
          direction: 'OUTBOUND',
          caseId: 'case-1',
          createThreadIfMissing: true,
          message: expect.objectContaining({
            id: 'draft-1',
            conversationId: 'conv-9',
            internetMessageId: '<d1@firm.test>',
            hasAttachments: false,
            from: { emailAddress: { name: 'สมชาย ใจดี', address: 'somchai@firm.test' } },
            toRecipients: [{ emailAddress: { address: 'client@example.com' } }],
          }),
        }),
      );
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firmId: 'firm-1',
          userId: 'user-1',
          action: 'CASE_EMAIL_SENT',
          metadata: expect.objectContaining({
            caseId: 'case-1',
            threadId: 'thread-1',
            mode: 'NEW',
            from: 'somchai@firm.test',
            to: ['client@example.com'],
            cc: [],
            clientRequestId: baseDto.clientRequestId,
          }),
        }),
      });
    });

    it('escapes HTML typed into the body', async () => {
      await service.send(user, 'case-1', { ...baseDto, body: '<script>x</script> & "q"' });

      expect(mockGraph.createDraftMessage.mock.calls[0][1].body.content).toBe(
        '<div>&lt;script&gt;x&lt;/script&gt; &amp; &quot;q&quot;</div>',
      );
    });

    it('de-duplicates recipients case-insensitively', async () => {
      await service.send(user, 'case-1', { ...baseDto, to: ['A@x.com', 'a@x.com'], cc: [' a@X.com ', 'b@x.com'] });

      const sent = mockGraph.createDraftMessage.mock.calls[0][1];
      expect(sent.toRecipients).toEqual([{ emailAddress: { address: 'A@x.com' } }]);
      expect(sent.ccRecipients).toEqual([{ emailAddress: { address: 'b@x.com' } }]);
    });

    it('refuses when the user has no active Microsoft connection', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);

      await expect(service.send(user, 'case-1', baseDto)).rejects.toThrow('ยังไม่ได้เชื่อมต่อ Microsoft 365');
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
    });

    it('refuses more than 50 recipients across To and CC', async () => {
      const many = Array.from({ length: 30 }, (_, i) => `p${i}@x.com`);
      const more = Array.from({ length: 21 }, (_, i) => `q${i}@x.com`);

      await expect(service.send(user, 'case-1', { ...baseDto, to: many, cc: more })).rejects.toBeInstanceOf(BadRequestException);
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
    });

    it('refuses a blank subject or body', async () => {
      await expect(service.send(user, 'case-1', { ...baseDto, subject: '   ' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.send(user, 'case-1', { ...baseDto, body: '\n ' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('attaches case documents as base64 file attachments', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', filename: 'สัญญา.pdf', mimeType: 'application/pdf', storagePath: 'cases/doc-1.pdf' },
      ]);
      mockStorage.getBuffer.mockResolvedValue(Buffer.from('pdf'));

      await service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-1'] });

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['doc-1'] }, caseId: 'case-1', storagePath: { not: '' } } }),
      );
      expect(mockGraph.addFileAttachment).toHaveBeenCalledWith('token-1', 'draft-1', {
        name: 'สัญญา.pdf',
        contentType: 'application/pdf',
        contentBytes: 'cGRm',
      });
      expect(mockGraph.addFileAttachment.mock.invocationCallOrder[0]).toBeLessThan(
        mockGraph.sendDraft.mock.invocationCallOrder[0],
      );
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.metadata.documentIds).toEqual(['doc-1']);
    });

    it('rejects a document over 3 MB before touching Graph', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', filename: 'คำฟ้อง.pdf', mimeType: 'application/pdf', storagePath: 'cases/doc-1.pdf' },
      ]);
      mockStorage.getBuffer.mockResolvedValue(Buffer.alloc(3 * 1024 * 1024 + 1));

      await expect(service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-1'] })).rejects.toThrow(
        'ไฟล์ "คำฟ้อง.pdf" ใหญ่เกิน 3 MB แนบตรงไม่ได้ — ใช้ลิงก์ OneDrive แทน',
      );
      expect(mockConnections.getValidAccessToken).not.toHaveBeenCalled();
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
    });

    it('rejects a document that is not in this case', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);

      await expect(service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-of-other-case'] })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
    });

    it('rejects a document whose file cannot be read from storage', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', filename: 'a.pdf', mimeType: 'application/pdf', storagePath: 'cases/doc-1.pdf' },
      ]);
      mockStorage.getBuffer.mockRejectedValue(new Error('ENOENT'));

      await expect(service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-1'] })).rejects.toBeInstanceOf(NotFoundException);
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
    });

    it('asks to reconnect when Graph refuses with 403', async () => {
      mockGraph.createDraftMessage.mockRejectedValue(new GraphApiError(403, 'ErrorAccessDenied'));

      await expect(service.send(user, 'case-1', baseDto)).rejects.toThrow('กรุณาเชื่อมต่อ Microsoft 365 ใหม่');
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('marks the connection expired when Graph answers 401', async () => {
      mockGraph.createDraftMessage.mockRejectedValue(new GraphApiError(401, 'InvalidAuthenticationToken'));

      await expect(service.send(user, 'case-1', baseDto)).rejects.toThrow('กรุณาเชื่อมต่อ Microsoft 365 ใหม่');
      expect(mockConnections.markError).toHaveBeenCalledWith('conn-1', 'EXPIRED', expect.any(String));
    });

    it('still reports success when recording the sent mail fails', async () => {
      mockSync.upsertGraphMessage.mockRejectedValue(new Error('db down'));
      mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('db down'));

      await expect(service.send(user, 'case-1', baseDto)).resolves.toEqual({ mode: 'NEW', threadId: null, recorded: false });
      expect(mockGraph.sendDraft).toHaveBeenCalledTimes(1);
    });
  });

  describe('double-send protection', () => {
    it('refuses a clientRequestId already in the audit log', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue({ id: 'audit-earlier' });

      await expect(service.send(user, 'case-1', baseDto)).rejects.toBeInstanceOf(ConflictException);
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: {
          firmId: 'firm-1',
          userId: 'user-1',
          action: 'CASE_EMAIL_SENT',
          metadata: { path: ['clientRequestId'], equals: baseDto.clientRequestId },
        },
        select: { id: true },
      });
    });

    it('refuses a clientRequestId that is already being sent', async () => {
      let release!: () => void;
      mockGraph.sendDraft.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));

      const first = service.send(user, 'case-1', baseDto);
      await new Promise((resolve) => setImmediate(resolve));
      await expect(service.send(user, 'case-1', baseDto)).rejects.toBeInstanceOf(ConflictException);

      release();
      await expect(first).resolves.toMatchObject({ mode: 'NEW' });
      expect(mockGraph.sendDraft).toHaveBeenCalledTimes(1);
    });
  });

  describe('compose options', () => {
    it('returns the sender mailbox (or null), ownRef and case recipients', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);
      mockPrisma.case.findFirst.mockResolvedValue({
        ownRef: 'TSB-1',
        client: { name: 'บริษัท ก', contacts: [{ name: 'คุณเอ', email: 'a@client.com' }] },
        additionalClients: [],
        customers: [],
        participants: [],
      });

      await expect(service.composeOptions(user, 'case-1')).resolves.toEqual({
        mailboxAddress: null,
        ownRef: 'TSB-1',
        recipients: [{ name: 'คุณเอ', email: 'a@client.com', source: 'CLIENT_CONTACT', group: 'บริษัท ก' }],
      });
    });

    it('buildRecipientOptions merges clients and participants, skips blanks, de-duplicates', () => {
      expect(
        buildRecipientOptions({
          client: { name: 'บริษัท ก', contacts: [{ name: 'คุณเอ', email: 'a@client.com' }, { name: 'ไม่มีเมล', email: null }] },
          additionalClients: [{ client: { name: 'บริษัท ข', contacts: [{ name: 'คุณบี', email: 'b@client.com' }] } }],
          customers: [{ customer: { name: 'บริษัท ก', contacts: [{ name: 'คุณเอ', email: 'A@client.com' }] } }],
          participants: [{ name: 'นายจำเลย', email: 'def@x.com' }, { name: 'ไม่มีเมล', email: '  ' }],
        }),
      ).toEqual([
        { name: 'คุณเอ', email: 'a@client.com', source: 'CLIENT_CONTACT', group: 'บริษัท ก' },
        { name: 'คุณบี', email: 'b@client.com', source: 'CLIENT_CONTACT', group: 'บริษัท ข' },
        { name: 'นายจำเลย', email: 'def@x.com', source: 'PARTICIPANT', group: 'คู่ความ' },
      ]);
    });
  });
});
