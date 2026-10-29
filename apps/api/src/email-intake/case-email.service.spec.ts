import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { CaseEmailService, excerptAround } from './case-email.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { DocumentsService } from '../documents/documents.service';
import { FileStorageService } from '../common/services/file-storage.service';

describe('CaseEmailService', () => {
  let service: CaseEmailService;
  const mockPrisma = {
    emailThread: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    case: { findMany: jest.fn(), findFirst: jest.fn() },
    emailMessage: { findMany: jest.fn() },
    // loadLatestMessages uses DISTINCT ON via $queryRaw; it serves the same latest-message rows.
    $queryRaw: jest.fn(),
    firmMember: { findMany: jest.fn() },
    mailboxConnection: { findMany: jest.fn() },
    emailAttachment: { findFirst: jest.fn() },
    document: { findFirst: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const threadFilter = { firmId: 'firm-1' };
  const mockCaseAccess = {
    getEmailThreadFilterForUser: jest.fn(),
    getCaseFilterForUser: jest.fn(),
    canAccessCase: jest.fn(),
  };
  const mockDocuments = { createFromBuffer: jest.fn() };
  const mockFileStorage = { getBuffer: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue(threadFilter);
    mockPrisma.emailMessage.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockImplementation(() => mockPrisma.emailMessage.findMany());
    mockPrisma.firmMember.findMany.mockResolvedValue([]);
    mockPrisma.mailboxConnection.findMany.mockResolvedValue([]);
    mockCaseAccess.getCaseFilterForUser.mockReturnValue({ firmId: 'firm-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseEmailService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: DocumentsService, useValue: mockDocuments },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(CaseEmailService);
  });

  describe('linkThread', () => {
    it('links a visible thread to a case the user can open, marks it LINKED and audits', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: null, intakeId: null });
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.emailThread.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.linkThread(user, 'thread-1', 'case-1')).resolves.toEqual({ threadId: 'thread-1', caseId: 'case-1' });

      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [threadFilter, { id: 'thread-1' }] } }),
      );
      expect(mockPrisma.emailThread.updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-1', caseId: null },
        data: { caseId: 'case-1', status: 'LINKED', caseUnlinkedAt: null },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'EMAIL_THREAD_LINKED' }),
      });
    });

    it('refuses a case the user cannot open', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: null, intakeId: null });
      mockCaseAccess.canAccessCase.mockResolvedValue(false);
      await expect(service.linkThread(user, 'thread-1', 'case-x')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.emailThread.update).not.toHaveBeenCalled();
    });

    it('refuses a thread already filed under another case, and is a no-op for the same case', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: 'case-2', intakeId: null });
      await expect(service.linkThread(user, 'thread-1', 'case-1')).rejects.toBeInstanceOf(ConflictException);
      await expect(service.linkThread(user, 'thread-1', 'case-2')).resolves.toEqual({ threadId: 'thread-1', caseId: 'case-2' });
      expect(mockPrisma.emailThread.update).not.toHaveBeenCalled();
    });

    it('conflicts when a concurrent link won the race (guarded update matches nothing)', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: null, intakeId: null });
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.emailThread.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.linkThread(user, 'thread-1', 'case-1')).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('404s a thread the user cannot see', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(null);
      await expect(service.linkThread(user, 'thread-x', 'case-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('unlinkThread', () => {
    it('puts an unlinked thread back in the queue (PENDING_INTAKE)', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: 'case-1', intakeId: null });
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      await expect(service.unlinkThread(user, 'thread-1')).resolves.toEqual({ unlinked: true });
      expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { caseId: null, caseUnlinkedAt: expect.any(Date), status: 'PENDING_INTAKE' },
      });
    });

    it('keeps LINKED when the thread still belongs to an intake', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: 'case-1', intakeId: 'intake-1' });
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      await service.unlinkThread(user, 'thread-1');
      expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-1' },
        data: { caseId: null, caseUnlinkedAt: expect.any(Date), status: 'LINKED' },
      });
    });

    it('forbids unlinking when the user cannot open the case (e.g. sees the thread only via its intake)', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', caseId: 'case-1', intakeId: 'intake-1' });
      mockCaseAccess.canAccessCase.mockResolvedValue(false);
      await expect(service.unlinkThread(user, 'thread-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.emailThread.update).not.toHaveBeenCalled();
    });
  });

  describe('suggestCasesForThread', () => {
    it('merges contact-email matches with Own Ref/case number in the subject, excluding our own mailbox', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        subject: 'RE: TSBREF20250001 สมชาย ใจดี',
        fromAddress: 'Client@ABC.co.th',
        mailboxConnection: { mailboxAddress: 'lawyer@firm.co.th' },
        messages: [{ fromAddress: 'lawyer@firm.co.th', toAddresses: ['client@abc.co.th'], ccAddresses: ['boss@abc.co.th'] }],
      });
      mockPrisma.case.findMany
        .mockResolvedValueOnce([
          { id: 'case-1', ownRef: 'TSBREF20250001', title: 'ผิดสัญญา' },
          { id: 'case-3', ownRef: 'TSBREF20250003', title: 'อีกคดี' },
        ])
        .mockResolvedValueOnce([
          { id: 'case-1', ownRef: 'TSBREF20250001', title: 'ผิดสัญญา', clientName: null, blackCaseNumber: null, redCaseNumber: null, client: null, proceedings: [] },
          { id: 'case-2', ownRef: 'TSBREF20250002', title: 'ค่าเสียหาย', clientName: 'นายสมชาย ใจดี', blackCaseNumber: null, redCaseNumber: null, client: null, proceedings: [] },
        ]);

      const result = await service.suggestCasesForThread(user, 'thread-1');

      expect(result).toEqual([
        { caseId: 'case-1', ownRef: 'TSBREF20250001', title: 'ผิดสัญญา', reasons: ['OWN_REF', 'CONTACT_EMAIL'] },
        { caseId: 'case-3', ownRef: 'TSBREF20250003', title: 'อีกคดี', reasons: ['CONTACT_EMAIL'] },
      ]);
      const contactQuery = JSON.stringify(mockPrisma.case.findMany.mock.calls[0][0]);
      expect(contactQuery).toContain('client@abc.co.th');
      expect(contactQuery).toContain('boss@abc.co.th');
      expect(contactQuery).not.toContain('lawyer@firm.co.th');
    });
  });

  describe('listUnknownAddresses', () => {
    const thread = {
      fromAddress: 'Client@Acme.co.th',
      mailboxConnection: { mailboxAddress: 'office@firm.co' },
      messages: [
        {
          fromName: 'คุณสมชาย',
          fromAddress: 'client@acme.co.th',
          toAddresses: ['office@firm.co', 'known@acme.co.th'],
          ccAddresses: ['Lawyer@Firm.co', 'opp@other.com'],
        },
        { fromName: null, fromAddress: 'lawyer@firm.co', toAddresses: ['client@acme.co.th'], ccAddresses: ['Party@X.com'] },
      ],
    };

    it('lists thread addresses the case does not know, with the sender name where one was given', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockPrisma.case.findFirst.mockResolvedValue({
        client: { contacts: [{ email: 'KNOWN@acme.co.th' }] },
        participants: [{ email: 'party@x.com' }, { email: null }],
      });
      mockPrisma.firmMember.findMany.mockResolvedValue([{ user: { email: 'Lawyer@firm.co' } }]);

      await expect(service.listUnknownAddresses(user, 'case-1', 'thread-1')).resolves.toEqual([
        { address: 'client@acme.co.th', name: 'คุณสมชาย' },
        { address: 'opp@other.com', name: null },
      ]);
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [threadFilter, { id: 'thread-1', caseId: 'case-1' }] } }),
      );
      expect(mockPrisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case-1', firmId: 'firm-1' } }));
    });

    it('treats a firm mailbox as known, and a case without a client only checks participants', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        ...thread,
        fromAddress: 'office@firm.co',
        mailboxConnection: null,
        messages: [{ fromName: null, fromAddress: 'office@firm.co', toAddresses: ['new@acme.co.th'], ccAddresses: [] }],
      });
      mockPrisma.case.findFirst.mockResolvedValue({ client: null, participants: [] });
      mockPrisma.mailboxConnection.findMany.mockResolvedValue([{ mailboxAddress: 'Office@firm.co' }]);

      await expect(service.listUnknownAddresses(user, 'case-1', 'thread-1')).resolves.toEqual([
        { address: 'new@acme.co.th', name: null },
      ]);
    });

    it('404s a thread that is not on this case or not visible', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(null);
      await expect(service.listUnknownAddresses(user, 'case-1', 'thread-9')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.case.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('listCaseThreads', () => {
    it('scopes to the case through the thread visibility filter and counts attachments', async () => {
      mockPrisma.emailThread.findMany.mockResolvedValue([
        {
          id: 'thread-1', subject: 'ส่งเอกสาร', fromName: 'ABC', fromAddress: 'a@abc.co.th',
          lastMessageAt: new Date('2026-10-13T01:00:00Z'),
          messages: [{ _count: { attachments: 2 } }, { _count: { attachments: 1 } }],
        },
      ]);

      const rows = await service.listCaseThreads(user, 'case-1');

      expect(mockPrisma.emailThread.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [threadFilter, { caseId: 'case-1' }] } }),
      );
      expect(rows[0]).toMatchObject({ id: 'thread-1', messageCount: 2, attachmentCount: 3 });
    });
  });

  describe('getCaseThread', () => {
    it('marks attachments already saved to the case documents', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1', subject: 's', caseId: 'case-1', lastMessageAt: new Date(),
        messages: [{ id: 'm1', attachments: [{ id: 'att-1', filename: 'a.pdf' }, { id: 'att-2', filename: 'b.pdf' }] }],
      });
      mockPrisma.document.findMany.mockResolvedValue([{ id: 'doc-9', tags: ['อีเมล', 'email-attachment:att-2'] }]);

      const thread = await service.getCaseThread(user, 'case-1', 'thread-1');

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { caseId: 'case-1', tags: { hasSome: ['email-attachment:att-1', 'email-attachment:att-2'] }, storagePath: { not: '' } },
        }),
      );
      expect(thread.messages[0].attachments.map((a) => a.savedDocumentId)).toEqual([null, 'doc-9']);
    });
  });

  describe('searchThreads', () => {
    it('ignores queries shorter than 2 chars or not a string, without touching the DB', async () => {
      await expect(service.searchThreads(user, ' a ')).resolves.toEqual([]);
      await expect(service.searchThreads(user, ['ab', 'cd'])).resolves.toEqual([]);
      expect(mockPrisma.emailThread.findMany).not.toHaveBeenCalled();
    });

    it('searches only visible threads and returns case, counts and a body excerpt', async () => {
      mockPrisma.emailThread.findMany.mockResolvedValue([
        {
          id: 'thread-1', subject: 'สัญญาเช่า', fromName: 'สมชาย', fromAddress: 's@x.com', lastMessageAt: new Date(),
          status: 'LINKED', intakeId: null, case: { id: 'case-1', ownRef: 'C-1', title: 'คดีเช่า' },
          messages: [{ _count: { attachments: 1 } }, { _count: { attachments: 0 } }],
        },
      ]);
      mockPrisma.emailMessage.findMany.mockResolvedValue([{ threadId: 'thread-1', bodyText: 'เรียนท่าน\nแนบสัญญาเช่ามาให้ครับ' }]);

      const rows = await service.searchThreads(user, '  สัญญา ');

      const where = mockPrisma.emailThread.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toBe(threadFilter);
      expect(where.AND[1].OR[0]).toEqual({ subject: { contains: 'สัญญา', mode: 'insensitive' } });
      expect(mockPrisma.emailThread.findMany.mock.calls[0][0].take).toBe(50);
      expect(rows).toEqual([
        expect.objectContaining({
          id: 'thread-1', case: { id: 'case-1', ownRef: 'C-1', title: 'คดีเช่า' },
          messageCount: 2, attachmentCount: 1, excerpt: 'เรียนท่าน แนบสัญญาเช่ามาให้ครับ',
        }),
      ]);
    });
  });

  describe('excerptAround', () => {
    it('cuts around the first hit, case-insensitively, with ellipses', () => {
      const text = `${'ก'.repeat(100)} Contract ${'ข'.repeat(100)}`;
      const out = excerptAround(text, 'contract');
      expect(out.startsWith('…')).toBe(true);
      expect(out.endsWith('…')).toBe(true);
      expect(out).toContain('Contract');
      expect(out.length).toBeLessThan(170);
      expect(excerptAround('hello', 'zz')).toBe('');
    });
  });

  describe('saveAttachmentToCase', () => {
    const attachment = { id: 'att-1', filename: 'สัญญา.pdf', mimeType: 'application/pdf', storagePath: 'outlook/firm-1/m/สัญญา.pdf' };

    it('404s an attachment that is not on a visible thread of this case', async () => {
      mockPrisma.emailAttachment.findFirst.mockResolvedValue(null);
      await expect(service.saveAttachmentToCase(user, 'case-1', 'att-x')).rejects.toBeInstanceOf(NotFoundException);
      expect(mockPrisma.emailAttachment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'att-x', message: { thread: { AND: [threadFilter, { caseId: 'case-1' }] } } },
        }),
      );
    });

    it('returns the existing document instead of saving the same attachment twice', async () => {
      mockPrisma.emailAttachment.findFirst.mockResolvedValue(attachment);
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', filename: 'สัญญา.pdf' });

      await expect(service.saveAttachmentToCase(user, 'case-1', 'att-1')).resolves.toEqual({
        document: { id: 'doc-1', filename: 'สัญญา.pdf' },
        alreadySaved: true,
      });
      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { caseId: 'case-1', tags: { has: 'email-attachment:att-1' }, storagePath: { not: '' } } }),
      );
      expect(mockDocuments.createFromBuffer).not.toHaveBeenCalled();
    });

    it('creates a case document from the stored attachment bytes', async () => {
      mockPrisma.emailAttachment.findFirst.mockResolvedValue(attachment);
      mockPrisma.document.findFirst.mockResolvedValue(null);
      mockFileStorage.getBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockDocuments.createFromBuffer.mockResolvedValue({ id: 'doc-2', filename: 'สัญญา.pdf' });

      const result = await service.saveAttachmentToCase(user, 'case-1', 'att-1');

      expect(mockFileStorage.getBuffer).toHaveBeenCalledWith('outlook/firm-1/m/สัญญา.pdf');
      expect(mockDocuments.createFromBuffer).toHaveBeenCalledWith(user, 'case-1', {
        filename: 'สัญญา.pdf',
        buffer: Buffer.from('pdf'),
        mimeType: 'application/pdf',
        category: 'CORRESPONDENCE',
        tags: ['อีเมล', 'email-attachment:att-1'],
      });
      expect(result).toEqual({ document: { id: 'doc-2', filename: 'สัญญา.pdf' }, alreadySaved: false });
    });

    it('concurrent saves of the same attachment create one document', async () => {
      mockPrisma.emailAttachment.findFirst.mockResolvedValue(attachment);
      mockPrisma.document.findFirst.mockResolvedValue(null);
      mockFileStorage.getBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockDocuments.createFromBuffer.mockResolvedValue({ id: 'doc-2', filename: 'สัญญา.pdf' });

      const [a, b] = await Promise.all([
        service.saveAttachmentToCase(user, 'case-1', 'att-1'),
        service.saveAttachmentToCase(user, 'case-1', 'att-1'),
      ]);

      expect(mockDocuments.createFromBuffer).toHaveBeenCalledTimes(1);
      expect(a).toBe(b);
      expect(a.document.id).toBe('doc-2');
    });

    it('releases the in-flight guard after a failure so a retry saves again', async () => {
      mockPrisma.emailAttachment.findFirst.mockResolvedValue(attachment);
      mockPrisma.document.findFirst.mockResolvedValue(null);
      mockFileStorage.getBuffer.mockResolvedValue(Buffer.from('pdf'));
      mockDocuments.createFromBuffer
        .mockRejectedValueOnce(new Error('s3 down'))
        .mockResolvedValueOnce({ id: 'doc-3', filename: 'สัญญา.pdf' });

      await expect(service.saveAttachmentToCase(user, 'case-1', 'att-1')).rejects.toThrow('s3 down');
      await expect(service.saveAttachmentToCase(user, 'case-1', 'att-1')).resolves.toMatchObject({ alreadySaved: false });
    });
  });

  describe('awaiting reply', () => {
    it('listCaseThreads exposes awaitingReplySince for an undismissed client email only', async () => {
      const at = new Date('2026-10-13T01:00:00Z');
      mockPrisma.emailThread.findMany.mockResolvedValue([
        { id: 't1', subject: 'a', fromName: null, fromAddress: 'c@x.com', lastMessageAt: at, replyDismissedAt: null, messages: [] },
        { id: 't2', subject: 'b', fromName: null, fromAddress: 'c@x.com', lastMessageAt: at, replyDismissedAt: new Date('2026-10-13T02:00:00Z'), messages: [] },
        { id: 't3', subject: 'c', fromName: null, fromAddress: 'me@firm.com', lastMessageAt: at, replyDismissedAt: null, messages: [] },
      ]);
      mockPrisma.firmMember.findMany.mockResolvedValue([{ user: { email: 'me@firm.com' } }]);
      mockPrisma.mailboxConnection.findMany.mockResolvedValue([]);
      mockPrisma.emailMessage.findMany.mockResolvedValue([
        { id: 'm1', threadId: 't1', direction: 'INBOUND', fromAddress: 'c@x.com', receivedAt: at },
        { id: 'm2', threadId: 't2', direction: 'INBOUND', fromAddress: 'c@x.com', receivedAt: at },
        { id: 'm3', threadId: 't3', direction: 'INBOUND', fromAddress: 'ME@firm.com', receivedAt: at },
      ]);
      const result = await service.listCaseThreads(user, 'case-1');
      expect(result.map((t: any) => t.awaitingReplySince)).toEqual([at.toISOString(), null, null]);
    });

    it('setReplyDismissed sets/clears the flag and audits; 404 when not visible', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't1' });
      await service.setReplyDismissed(user, 'case-1', 't1', true);
      expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { replyDismissedAt: expect.any(Date) } });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'EMAIL_REPLY_DISMISSED' }) });
      await service.setReplyDismissed(user, 'case-1', 't1', false);
      expect(mockPrisma.emailThread.update).toHaveBeenLastCalledWith({ where: { id: 't1' }, data: { replyDismissedAt: null } });
      expect(mockPrisma.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ action: 'EMAIL_REPLY_UNDISMISSED' }) });
      mockPrisma.emailThread.findFirst.mockResolvedValue(null);
      await expect(service.setReplyDismissed(user, 'case-1', 'x', true)).rejects.toThrow(NotFoundException);
    });
  });
});
