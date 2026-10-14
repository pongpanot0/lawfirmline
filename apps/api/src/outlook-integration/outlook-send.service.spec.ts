import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { GraphApiError, OutlookGraphClient } from './outlook-graph.client';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { GraphDriveClient } from './graph/graph-drive.client';
import { OutlookSendService, buildRecipientOptions, prependToHtml } from './outlook-send.service';

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
  const mockDrive = { ensureFolderPath: jest.fn(), upload: jest.fn(), createSharingLink: jest.fn() };
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
    mockPrisma.case.findFirst.mockResolvedValue({ ownRef: 'TSB-1' });
    mockDrive.ensureFolderPath.mockResolvedValue({ id: 'folder-1' });
    mockDrive.upload.mockImplementation(async (_t: string, _d: string, _p: string, name: string) => ({
      id: `item-${name}`,
      parentReference: { driveId: 'drive-1' },
    }));
    mockDrive.createSharingLink.mockImplementation(async (_t: string, _d: string, itemId: string) => ({ webUrl: `https://1drv.test/${itemId}` }));

    const module = await Test.createTestingModule({
      providers: [
        OutlookSendService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: OutlookGraphClient, useValue: mockGraph },
        { provide: OutlookSyncService, useValue: mockSync },
        { provide: FileStorageService, useValue: mockStorage },
        { provide: GraphDriveClient, useValue: mockDrive },
      ],
    }).compile();
    service = module.get(OutlookSendService);
  });

  describe('new email', () => {
    it('drafts, sends, records the message on the case and writes the audit log', async () => {
      const result = await service.send(user, 'case-1', baseDto);

      expect(result).toEqual({ mode: 'NEW', threadId: 'thread-1', recorded: true, linkedFiles: [] });
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

    describe('large files as OneDrive links', () => {
      const MB = 1024 * 1024;
      const docs = (...names: string[]) =>
        names.map((n) => ({ id: `doc-${n}`, filename: `${n}.pdf`, mimeType: 'application/pdf', storagePath: `cases/${n}.pdf` }));
      const sizes = (m: Record<string, number>) =>
        mockStorage.getBuffer.mockImplementation(async (path: string) => Buffer.alloc(m[path.replace('cases/', '').replace('.pdf', '')]));

      it('attaches a file of exactly 3 MB inline and creates no link', async () => {
        mockPrisma.document.findMany.mockResolvedValue(docs('a'));
        sizes({ a: 3 * MB });

        const result = await service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-a'] });

        expect(mockGraph.addFileAttachment).toHaveBeenCalledTimes(1);
        expect(mockDrive.upload).not.toHaveBeenCalled();
        expect(result.linkedFiles).toEqual([]);
      });

      it('sends a 4 MB file as a link to to+cc (de-duplicated), placed in the body', async () => {
        mockPrisma.document.findMany.mockResolvedValue(docs('big'));
        sizes({ big: 4 * MB });

        const result = await service.send(user, 'case-1', {
          ...baseDto,
          to: ['A@x.com'],
          cc: ['a@x.com', 'b@x.com'],
          documentIds: ['doc-big'],
        });

        expect(mockDrive.ensureFolderPath).toHaveBeenCalledWith('token-1', ['Samnuan', 'TSB-1', 'ส่งออก']);
        expect(mockDrive.upload).toHaveBeenCalledWith('token-1', 'me', 'folder-1', 'big.pdf', expect.any(Buffer), 'application/pdf');
        expect(mockDrive.createSharingLink).toHaveBeenCalledWith('token-1', 'drive-1', 'item-big.pdf', ['A@x.com', 'b@x.com']);
        const html = mockGraph.createDraftMessage.mock.calls[0][1].body.content;
        expect(html).toContain('<a href="https://1drv.test/item-big.pdf">big.pdf</a> (4.0 MB)');
        expect(html.indexOf('เรียนคุณลูกความ')).toBeLessThan(html.indexOf('ลิงก์ OneDrive'));
        expect(mockGraph.addFileAttachment).not.toHaveBeenCalled();
        expect(result.linkedFiles).toEqual([{ documentId: 'doc-big', filename: 'big.pdf' }]);
        expect(mockPrisma.auditLog.create.mock.calls[0][0].data.metadata.linkedDocumentIds).toEqual(['doc-big']);
      });

      it('puts the link block above the quoted original when replying', () => {
        expect(prependToHtml('<html><body>quoted</body></html>', '<div>hi</div><p>links</p>')).toBe(
          '<html><body><div>hi</div><p>links</p><br>quoted</body></html>',
        );
      });

      it('links the files that overflow the 15 MB inline total', async () => {
        mockPrisma.document.findMany.mockResolvedValue(docs('a', 'b', 'c', 'd', 'e', 'f'));
        sizes({ a: 3 * MB, b: 3 * MB, c: 3 * MB, d: 3 * MB, e: 3 * MB, f: 2 * MB });

        const result = await service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-a', 'doc-b', 'doc-c', 'doc-d', 'doc-e', 'doc-f'] });

        expect(mockGraph.addFileAttachment).toHaveBeenCalledTimes(5);
        expect(result.linkedFiles).toEqual([{ documentId: 'doc-f', filename: 'f.pdf' }]);
      });

      it('refuses with a Thai message and creates no draft when the tenant refuses the link', async () => {
        mockPrisma.document.findMany.mockResolvedValue(docs('big'));
        sizes({ big: 4 * MB });
        mockDrive.createSharingLink.mockRejectedValue(new GraphApiError(403, 'accessDenied'));

        await expect(service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-big'] })).rejects.toThrow(
          'องค์กรของคุณไม่อนุญาตให้แชร์ไฟล์ OneDrive ให้ผู้รับนี้ — ลดขนาดไฟล์หรือส่งทางช่องทางอื่น',
        );
        expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
        expect(mockGraph.sendDraft).not.toHaveBeenCalled();
      });

      it('rejects a selection over 100 MB in total before any Graph call', async () => {
        mockPrisma.document.findMany.mockResolvedValue(docs('huge'));
        sizes({ huge: 100 * MB + 1 });

        await expect(service.send(user, 'case-1', { ...baseDto, documentIds: ['doc-huge'] })).rejects.toThrow('100 MB');
        expect(mockConnections.getValidAccessToken).not.toHaveBeenCalled();
        expect(mockDrive.upload).not.toHaveBeenCalled();
      });
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

      await expect(service.send(user, 'case-1', baseDto)).resolves.toEqual({ mode: 'NEW', threadId: null, recorded: false, linkedFiles: [] });
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

  describe('reply', () => {
    const sourceId = '0b7f6d1e-8a7c-4c1d-9a0f-4e2a1b3c5d6e';
    const replyDto = { ...baseDto, subject: 'Re: ขอเอกสารเพิ่ม', replyToMessageId: sourceId };
    const ownSource = {
      id: sourceId,
      graphMessageId: 'graph-src-1',
      thread: { mailboxConnectionId: 'conn-1' },
    };
    const replyDraft = {
      ...draft,
      id: 'reply-draft-1',
      conversationId: 'conv-original',
      body: { contentType: 'html', content: '<html><body class="x"><p>ข้อความเดิม</p></body></html>' },
    };

    beforeEach(() => {
      mockGraph.createReplyDraft.mockResolvedValue(replyDraft);
      mockGraph.updateDraft.mockImplementation(async (_t: string, _id: string, patch: { body: unknown }) => ({ ...replyDraft, body: patch.body }));
    });

    it('replies inside the Outlook conversation when the source is in my own mailbox', async () => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue(ownSource);

      const result = await service.send(user, 'case-1', replyDto);

      expect(mockPrisma.emailMessage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: sourceId, thread: { caseId: 'case-1' } } }),
      );
      expect(mockGraph.createReplyDraft).toHaveBeenCalledWith('token-1', 'graph-src-1', false);
      expect(mockGraph.updateDraft).toHaveBeenCalledWith('token-1', 'reply-draft-1', {
        subject: 'Re: ขอเอกสารเพิ่ม',
        body: {
          contentType: 'HTML',
          content: '<html><body class="x"><div>เรียนคุณลูกความ<br>ขอนัดประชุม</div><br><p>ข้อความเดิม</p></body></html>',
        },
        toRecipients: [{ emailAddress: { address: 'client@example.com' } }],
        ccRecipients: [],
      });
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
      expect(mockGraph.sendDraft).toHaveBeenCalledWith('token-1', 'reply-draft-1');
      expect(mockSync.upsertGraphMessage).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'case-1', message: expect.objectContaining({ conversationId: 'conv-original' }) }),
      );
      expect(result.mode).toBe('REPLY');
      expect(mockPrisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({ mode: 'REPLY', replyToMessageId: sourceId });
    });

    it('uses createReplyAll for reply-all', async () => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue(ownSource);

      await service.send(user, 'case-1', { ...replyDto, replyAll: true });

      expect(mockGraph.createReplyDraft).toHaveBeenCalledWith('token-1', 'graph-src-1', true);
    });

    it("sends a new message from my mailbox when the source is in a colleague's mailbox", async () => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue({ ...ownSource, thread: { mailboxConnectionId: 'conn-of-colleague' } });

      const result = await service.send(user, 'case-1', replyDto);

      expect(mockGraph.createReplyDraft).not.toHaveBeenCalled();
      expect(mockGraph.createDraftMessage).toHaveBeenCalledWith('token-1', expect.objectContaining({ subject: 'Re: ขอเอกสารเพิ่ม' }));
      expect(mockConnections.getValidAccessToken).toHaveBeenCalledWith('conn-1');
      expect(mockSync.upsertGraphMessage).toHaveBeenCalledWith(expect.objectContaining({ connectionId: 'conn-1', caseId: 'case-1' }));
      expect(result.mode).toBe('REPLY_AS_NEW');
    });

    it('sends a new message when the source has no Graph id (mock or legacy row)', async () => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue({ ...ownSource, graphMessageId: null });

      await expect(service.send(user, 'case-1', replyDto)).resolves.toMatchObject({ mode: 'REPLY_AS_NEW' });
      expect(mockGraph.createReplyDraft).not.toHaveBeenCalled();
    });

    it('falls back to a new message when Graph no longer has the source (404)', async () => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue(ownSource);
      mockGraph.createReplyDraft.mockRejectedValue(new GraphApiError(404, 'ErrorItemNotFound'));

      await expect(service.send(user, 'case-1', replyDto)).resolves.toMatchObject({ mode: 'REPLY_AS_NEW' });
      expect(mockGraph.createDraftMessage).toHaveBeenCalledTimes(1);
      expect(mockGraph.sendDraft).toHaveBeenCalledWith('token-1', 'draft-1');
    });

    it('refuses a source message that is not in this case', async () => {
      mockPrisma.emailMessage.findFirst.mockResolvedValue(null);

      await expect(service.send(user, 'case-1', replyDto)).rejects.toBeInstanceOf(NotFoundException);
      expect(mockGraph.createReplyDraft).not.toHaveBeenCalled();
      expect(mockGraph.createDraftMessage).not.toHaveBeenCalled();
    });

    it('prependToHtml puts the new text right after <body>, or in front when there is no body tag', () => {
      expect(prependToHtml('<html><body dir="ltr"><p>old</p></body></html>', '<div>new</div>')).toBe(
        '<html><body dir="ltr"><div>new</div><br><p>old</p></body></html>',
      );
      expect(prependToHtml('<p>old</p>', '<div>new</div>')).toBe('<div>new</div><br><p>old</p>');
      expect(prependToHtml(undefined, '<div>new</div>')).toBe('<div>new</div>');
    });
  });
});
