import { IntakeService } from '../intake/intake.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { OutlookSyncService } from '../outlook-integration/outlook-sync.service';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { CaseAccessService } from '../common/services/case-access.service';

describe('EmailIntakeService', () => {
  let service: EmailIntakeService;
  const mockPrisma = {
    emailThread: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    emailMessage: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    intake: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
    case: { updateMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
    intakeFieldProposal: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    client: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    clientContact: { count: jest.fn(), create: jest.fn() },
    emailAttachment: { findFirst: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    document: { findFirst: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), update: jest.fn() },
    intakeDocumentRequest: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    caseType: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    auditLog: { findFirst: jest.fn(), create: jest.fn() },
    firmMember: { findMany: jest.fn().mockResolvedValue([]) },
    mailboxConnection: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const mockCaseAccess = {
    getEmailThreadFilterForUser: jest.fn(async (user: { firmId: string }): Promise<any> => ({
      firmId: user.firmId,
    })),
    getIntakeFilterForUser: jest.fn(),
    getCaseFilterForUser: jest.fn(),
  };
  const mockIntake = { findOne: jest.fn(), openPreLitCase: jest.fn(), convertToCase: jest.fn() };
  const mockStorage = { getBuffer: jest.fn() };
  const mockIntelligence = { extractTextWithOcr: jest.fn() };
  const mockConfig = { get: jest.fn() };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;
  const mockOutlookSync = { inlineStoredImages: jest.fn(async (m: { bodyHtml: string }) => m.bodyHtml.replace('cid:logo', 'data:image/png;base64,AA==')) };

  beforeEach(async () => {
    jest.resetAllMocks();
    mockIntake.findOne.mockResolvedValue({ id: 'intake-1' });
    mockIntake.openPreLitCase.mockResolvedValue({ id: 'case-1' });
    mockPrisma.intake.findUniqueOrThrow.mockImplementation((args) => mockPrisma.intake.findUnique(args));
    mockPrisma.$transaction.mockImplementation((callback) => callback(mockPrisma));
    mockPrisma.emailThread.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.caseType.findMany.mockResolvedValue([]);
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.firmMember.findMany.mockResolvedValue([]);
    mockPrisma.mailboxConnection.findMany.mockResolvedValue([]);
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1' });
    mockPrisma.intake.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.intakeFieldProposal.findMany.mockResolvedValue([]);
    mockPrisma.intakeDocumentRequest.findMany.mockResolvedValue([]);
    mockPrisma.emailAttachment.groupBy.mockResolvedValue([]);
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
    mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
    mockCaseAccess.getCaseFilterForUser.mockReturnValue({ firmId: 'firm-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailIntakeService,
        { provide: IntakeService, useValue: mockIntake },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: ConfigService, useValue: mockConfig },
        { provide: FileStorageService, useValue: mockStorage },
        { provide: DocumentIntelligenceService, useValue: mockIntelligence },
        { provide: OutlookSyncService, useValue: mockOutlookSync },
      ],
    }).compile();
    service = module.get(EmailIntakeService);
  });

  it('getAttachmentForDownload checks the parent thread against the access filter', async () => {
    mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'f1', marker: 1 });
    mockPrisma.emailAttachment.findFirst.mockResolvedValue(null);
    await expect(service.getAttachmentForDownload(user, 'a1')).rejects.toThrow(NotFoundException);
    expect(mockPrisma.emailAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'a1', message: { thread: { firmId: 'f1', marker: 1 } } },
      select: { filename: true, mimeType: true, storagePath: true },
    });
  });

  it('getAttachmentForDownload returns the file info when the thread is accessible', async () => {
    const file = { filename: 'สัญญา.pdf', mimeType: 'application/pdf', storagePath: 'email/a1.pdf' };
    mockPrisma.emailAttachment.findFirst.mockResolvedValue(file);
    await expect(service.getAttachmentForDownload(user, 'a1')).resolves.toEqual(file);
  });

  describe('acceptIntakeFromThread', () => {
    it('attaches accepted mail to the selected existing case and links its thread there', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', intake: null, messages: [], lastMessageAt: new Date() });
      mockPrisma.case.count.mockResolvedValue(1);
      mockCaseAccess.getCaseFilterForUser = jest.fn().mockReturnValue({ firmId: 'firm-1' });
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1', relatedCaseId: 'existing-case' });
      mockIntake.findOne.mockResolvedValue({ id: 'intake-1', relatedCaseId: 'existing-case' });
      mockIntake.convertToCase.mockResolvedValue({ id: 'existing-case' });
      await expect(service.acceptIntakeFromThread(user, 'thread-1', { relatedCaseId: 'existing-case' })).resolves.toMatchObject({ caseId: 'existing-case' });
      expect(mockIntake.convertToCase).toHaveBeenCalledWith(user, 'intake-1', {});
      expect(mockIntake.openPreLitCase).not.toHaveBeenCalled();
      expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({ where: { id: 'thread-1' }, data: { caseId: 'existing-case', caseUnlinkedAt: null } });
    });

    it('is idempotent — re-accepting an already-linked thread does not create a second intake', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1',
        intake: { id: 'intake-1' },
        messages: [],
      });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1' });

      const result = await service.acceptIntakeFromThread(user, 'thread-1', {});

      expect(mockPrisma.intake.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'intake-1', caseId: 'case-1' });
      expect(mockIntake.openPreLitCase).toHaveBeenCalledWith(user, { id: 'intake-1' }, {}, { recordOnly: true });
      expect(mockPrisma.emailThread.update).toHaveBeenCalledWith({ where: { id: 'thread-1' }, data: { caseId: 'case-1', caseUnlinkedAt: null } });
    });

    it('a second accept that loses the race returns the winner\'s intake and adds nothing', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1', intake: null, subject: 's', fromName: 'A', fromAddress: 'a@x.test', messages: [] });
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.intake.create.mockResolvedValue({ id: 'loser' });
      mockPrisma.emailThread.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailThread.findUnique.mockResolvedValue({ intakeId: 'winner' });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'winner' });

      await expect(service.acceptIntakeFromThread(user, 'thread-1', {})).resolves.toEqual({ id: 'winner', caseId: 'case-1' });
      expect(mockPrisma.emailThread.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'thread-1', intakeId: null } }));
      expect(mockPrisma.intakeFieldProposal.createMany).not.toHaveBeenCalled();
    });

    it('throws when the thread does not exist for this firm', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(null);
      await expect(service.acceptIntakeFromThread(user, 'missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachThreadToIntake (client sent a new e-mail instead of replying)', () => {
    const thread = { id: 'thread-2', intake: null, messages: [{ id: 'in', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyText: 'เรียกร้อง 200,000 บาท', attachments: [] }] };

    it('joins the thread and proposes from its messages', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.emailThread.updateMany.mockResolvedValue({ count: 1 });

      await service.attachThreadToIntake(user, 'thread-2', 'intake-1');

      expect(mockPrisma.emailThread.updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-2', intakeId: null },
        data: { intakeId: 'intake-1', caseId: null, status: 'LINKED', caseUnlinkedAt: null },
      });
      const created = mockPrisma.intakeFieldProposal.createMany.mock.calls[0][0].data;
      expect(created).toEqual(expect.arrayContaining([expect.objectContaining({ intakeId: 'intake-1', field: 'estimatedDamage', proposedValue: '200000' })]));
    });

    it('refuses an intake this person cannot open', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1', marker: 'x' });
      mockPrisma.intake.findFirst.mockResolvedValue(null);

      await expect(service.attachThreadToIntake(user, 'thread-2', 'intake-9')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.intake.findFirst).toHaveBeenCalledWith({ where: { id: 'intake-9', firmId: 'firm-1', marker: 'x' }, select: { id: true, case: { select: { id: true } } } });
      expect(mockPrisma.emailThread.updateMany).not.toHaveBeenCalled();
    });

    it('will not move a thread that already belongs to another intake', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ ...thread, intake: { id: 'intake-other' } });
      await expect(service.attachThreadToIntake(user, 'thread-2', 'intake-1')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.emailThread.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('newest message is OUTBOUND', () => {
    it('intake description and proposals come from the latest INBOUND message', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1', intake: null, fromName: 'S', fromAddress: 's@example.com', subject: 'x', lastMessageAt: new Date(),
        messages: [
          { id: 'out', direction: 'OUTBOUND', toAddresses: [], ccAddresses: [], bodyText: 'ตอบกลับจากทนาย', attachments: [] },
          { id: 'in', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyText: 'ข้อความจากลูกความ', attachments: [] },
        ],
      });
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1' });
      await service.acceptIntakeFromThread(user, 'thread-1', {});
      expect(mockPrisma.intake.create.mock.calls[0][0].data.description).toBe('ข้อความจากลูกความ\n\n— S <s@example.com>');
    });

    it('falls back to the latest message when a thread has no INBOUND message', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1', intake: null, fromName: 'S', fromAddress: 's@example.com', subject: 'x', lastMessageAt: new Date(),
        messages: [{ id: 'out', direction: 'OUTBOUND', toAddresses: [], ccAddresses: [], bodyText: 'ตอบกลับจากทนาย', attachments: [] }],
      });
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1' });
      await service.acceptIntakeFromThread(user, 'thread-1', {});
      expect(mockPrisma.intake.create.mock.calls[0][0].data.description).toBe('ตอบกลับจากทนาย\n\n— S <s@example.com>');
    });

    it('list excerpt comes from one SQL pick per thread (newest INBOUND, else newest)', async () => {
      mockPrisma.emailThread.findMany.mockResolvedValue([
        { id: 't1', subject: 'a', lastMessageAt: new Date(), status: 'NEW', _count: { messages: 2 }, intake: null },
        { id: 't2', subject: 'b', lastMessageAt: new Date(), status: 'NEW', _count: { messages: 1 }, intake: null },
      ]);
      // The query orders INBOUND first per thread; the service trusts that pick.
      mockPrisma.$queryRaw.mockResolvedValue([
        { id: 'in', threadId: 't1', excerpt: 'ลูกความถาม' },
        { id: 'o2', threadId: 't2', excerpt: 'ส่งออกอย่างเดียว' },
      ]);
      mockPrisma.emailAttachment.groupBy.mockResolvedValue([{ messageId: 'in', _count: { _all: 1 } }]);
      const list = await service.listThreads(user);
      expect(list[0]).toMatchObject({ bodyExcerpt: 'ลูกความถาม', attachmentCount: 1 });
      expect(list[1]).toMatchObject({ bodyExcerpt: 'ส่งออกอย่างเดียว', attachmentCount: 0 });
      // No message bodies are loaded through Prisma for the list.
      expect(mockPrisma.emailMessage.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.emailThread.findMany.mock.calls[0][0].include.messages).toBeUndefined();
    });
  });

  describe('resolveFieldProposal', () => {
    const intake = { id: 'intake-1', firmId: 'firm-1' };

    it('writes the confirmed value onto the Intake and marks the proposal CONFIRMED', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(intake);
      mockPrisma.intakeFieldProposal.findFirst.mockResolvedValue({
        id: 'proposal-1',
        intakeId: 'intake-1',
        field: 'estimatedDamage',
        proposedValue: '450000',
        status: 'REQUIRES_CONFIRMATION',
      });
      mockPrisma.intakeFieldProposal.update.mockResolvedValue({ id: 'proposal-1', status: 'CONFIRMED' });

      await service.resolveFieldProposal(user, 'intake-1', 'proposal-1', { action: 'confirm' });

      expect(mockPrisma.intake.update).toHaveBeenCalledWith({
        where: { id: 'intake-1' },
        data: { estimatedDamage: 450000 },
      });
      expect(mockPrisma.intakeFieldProposal.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proposal-1' },
          data: expect.objectContaining({ status: 'CONFIRMED', confirmedById: user.id }),
        }),
      );
    });

    it('scopes the intake lookup by the intake access filter; no access -> NotFound and no write', async () => {
      mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1', marker: 'intake' });
      mockPrisma.intake.findFirst.mockResolvedValue(null);

      await expect(
        service.resolveFieldProposal(user, 'intake-1', 'proposal-1', { action: 'confirm' }),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.intake.findFirst).toHaveBeenCalledWith({
        where: { id: 'intake-1', firmId: 'firm-1', marker: 'intake' },
        include: { case: { select: { id: true } } },
      });
      expect(mockPrisma.intakeFieldProposal.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.intakeFieldProposal.update).not.toHaveBeenCalled();
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
    });

    it('is a no-op on a proposal already resolved (prevents duplicate confirmation)', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(intake);
      mockPrisma.intakeFieldProposal.findFirst.mockResolvedValue({
        id: 'proposal-1',
        field: 'estimatedDamage',
        status: 'CONFIRMED',
      });

      await service.resolveFieldProposal(user, 'intake-1', 'proposal-1', { action: 'confirm' });

      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
      expect(mockPrisma.intakeFieldProposal.update).not.toHaveBeenCalled();
    });

    it('rejecting a proposal does not write to the Intake', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(intake);
      mockPrisma.intakeFieldProposal.findFirst.mockResolvedValue({
        id: 'proposal-1',
        field: 'estimatedDamage',
        status: 'REQUIRES_CONFIRMATION',
      });
      mockPrisma.intakeFieldProposal.update.mockResolvedValue({ id: 'proposal-1', status: 'REJECTED' });

      await service.resolveFieldProposal(user, 'intake-1', 'proposal-1', { action: 'reject' });

      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
    });
  });

  describe('recordReply', () => {
    it('thread outside the access filter -> NotFound and no message created', async () => {
      mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'firm-1', marker: 'thread' });
      mockPrisma.emailThread.findFirst.mockResolvedValue(null);

      await expect(service.recordReply(user, 'thread-1', { bodyText: 'x' })).rejects.toThrow(NotFoundException);

      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { id: 'thread-1', firmId: 'firm-1', marker: 'thread' },
      });
      expect(mockPrisma.emailMessage.create).not.toHaveBeenCalled();
    });

    it('proposes new values instead of writing directly, so a confirmed field is never silently overwritten', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1',
        intakeId: 'intake-1',
        fromName: 'Somchai',
        fromAddress: 'client@example.com',
      });
      mockPrisma.emailMessage.create.mockResolvedValue({
        id: 'message-2',
        receivedAt: new Date('2026-09-09'),
      });
      mockPrisma.emailMessage.findUnique.mockResolvedValue({ id: 'message-2' });

      await service.recordReply(user, 'thread-1', { bodyText: 'ชำระแล้วบางส่วน เหลือ 400,000 บาท' });

      expect(mockPrisma.intakeFieldProposal.createMany).toHaveBeenCalled();
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
    });
  });
  describe('v2 confirmed values', () => {
    const confirm = async (field: string, value: string) => {
      mockPrisma.intakeFieldProposal.findFirst.mockResolvedValue({ id: 'p', field, proposedValue: value, status: 'REQUIRES_CONFIRMATION' });
      return service.resolveFieldProposal(user, 'intake-1', 'p', { action: 'confirm' });
    };

    it.each(['title', 'clientName', 'contactName', 'opposingParty', 'description', 'insurerName', 'policyNumber', 'claimNumber', 'matterType', 'customerRef', 'externalCaseNumber'])('persists text %s', async (field) => {
      await confirm(field, 'confirmed text');
      expect(mockPrisma.intake.update).toHaveBeenCalledWith({ where: { id: 'intake-1' }, data: { [field]: 'confirmed text' } });
    });

    it.each(['estimatedDamage', 'insurerPaidAmount', 'settlementOfferAmount'])('persists numeric %s including zero', async (field) => {
      await confirm(field, '82400');
      expect(mockPrisma.intake.update).toHaveBeenLastCalledWith({ where: { id: 'intake-1' }, data: { [field]: 82400 } });
      await confirm(field, '0');
      expect(mockPrisma.intake.update).toHaveBeenLastCalledWith({ where: { id: 'intake-1' }, data: { [field]: 0 } });
    });

    it('will not let a second matter silently replace a value confirmed for the first', async () => {
      const proposal = { id: 'p', field: 'estimatedDamage', proposedValue: '3500000', status: 'REQUIRES_CONFIRMATION', matterLabel: 'วิชัย' };
      const confirmedOther = { matterLabel: 'สมศรี', proposedValue: '1000000' };
      mockPrisma.intakeFieldProposal.findFirst.mockResolvedValueOnce(proposal).mockResolvedValueOnce(confirmedOther);
      await expect(service.resolveFieldProposal(user, 'intake-1', 'p', { action: 'confirm' })).rejects.toThrow('สมศรี');
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();

      // Typing the value ("แก้ไข") is a deliberate overwrite.
      mockPrisma.intakeFieldProposal.findFirst.mockResolvedValueOnce(proposal);
      await service.resolveFieldProposal(user, 'intake-1', 'p', { action: 'confirm', overrideValue: '4500000' });
      expect(mockPrisma.intake.update).toHaveBeenCalledWith({ where: { id: 'intake-1' }, data: { estimatedDamage: 4500000 } });
    });

    it('keeps case access on the title sync write', async () => {
      const caseFilter = { firmId: 'firm-1', deletedAt: null, OR: [{ leadLawyerId: user.id }] };
      mockCaseAccess.getCaseFilterForUser.mockReturnValue(caseFilter);
      await confirm('title', 'ชื่อคดี');
      expect(mockPrisma.case.updateMany).toHaveBeenCalledWith({ where: { intakeId: 'intake-1', ...caseFilter }, data: { title: 'ชื่อคดี' } });
    });

    it('a confirmed title or claimed amount also updates the pre-litigation case', async () => {
      await confirm('estimatedDamage', '1000000');
      expect(mockPrisma.case.updateMany).toHaveBeenCalledWith({ where: { intakeId: 'intake-1', firmId: 'firm-1' }, data: { claimedAmount: 1000000 } });
      mockPrisma.case.updateMany.mockClear();
      await confirm('policyNumber', 'P-1');
      expect(mockPrisma.case.updateMany).not.toHaveBeenCalled();
    });

    it('a confirmed contact person is also saved on the customer, once', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', clientId: 'client-1' });
      mockPrisma.clientContact.count.mockResolvedValueOnce(0);
      await confirm('contactName', 'จิรญาดา สุทธิวาศ (Jirayada Sutthivas)');
      expect(mockPrisma.clientContact.create).toHaveBeenCalledWith({ data: { clientId: 'client-1', name: 'จิรญาดา สุทธิวาศ (Jirayada Sutthivas)', isPrimary: false } });
      mockPrisma.clientContact.create.mockClear();
      mockPrisma.clientContact.count.mockResolvedValueOnce(1);
      await confirm('contactName', 'จิรญาดา สุทธิวาศ (Jirayada Sutthivas)');
      expect(mockPrisma.clientContact.create).not.toHaveBeenCalled();
    });

    it('turns a suggested missing document into a request, once', async () => {
      mockPrisma.intakeDocumentRequest.findFirst.mockResolvedValueOnce(null);
      await confirm('docRequest', 'เวชระเบียนฉบับเต็ม');
      expect(mockPrisma.intakeDocumentRequest.create).toHaveBeenCalledWith({ data: { intakeId: 'intake-1', name: 'เวชระเบียนฉบับเต็ม', createdById: 'user-1' } });
      mockPrisma.intakeDocumentRequest.create.mockClear();
      mockPrisma.intakeDocumentRequest.findFirst.mockResolvedValueOnce({ id: 'r1' });
      await confirm('docRequest', 'เวชระเบียนฉบับเต็ม');
      expect(mockPrisma.intakeDocumentRequest.create).not.toHaveBeenCalled();
    });

    it('sets the case type by its name within the firm, and rejects unknown names', async () => {
      mockPrisma.caseType.findFirst.mockResolvedValueOnce({ id: 'ct-1' });
      await confirm('caseType', 'ละเมิดทางการแพทย์');
      expect(mockPrisma.caseType.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ firmId: 'firm-1', name: 'ละเมิดทางการแพทย์' }) }));
      expect(mockPrisma.intake.update).toHaveBeenCalledWith({ where: { id: 'intake-1' }, data: { caseTypeId: 'ct-1' } });
      mockPrisma.caseType.findFirst.mockResolvedValueOnce(null);
      await expect(confirm('caseType', 'อื่นๆ')).rejects.toThrow(BadRequestException);
    });

    it('accepts only a real party role', async () => {
      await confirm('partyRole', 'DEFENDANT');
      expect(mockPrisma.intake.update).toHaveBeenCalledWith({ where: { id: 'intake-1' }, data: { partyRole: 'DEFENDANT' } });
      await expect(confirm('partyRole', 'จำเลย')).rejects.toThrow(BadRequestException);
    });

    it.each(['incidentDate', 'requestedResponseDate', 'deadlineDate'])('persists %s and converts Buddhist years', async (field) => {
      await confirm(field, '2569-10-31');
      expect(mockPrisma.intake.update).toHaveBeenCalledWith({ where: { id: 'intake-1' }, data: { [field]: new Date('2026-10-31T00:00:00.000Z') } });
    });

    it('appends otherAmounts and skips only exact label+amount duplicates', async () => {
      const existing = { label: 'ค่ารักษาค้างชำระ', amount: 100 };
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', otherAmounts: [existing] });
      await confirm('otherAmount', JSON.stringify({ label: existing.label, amount: 82400 }));
      expect(mockPrisma.intake.update).toHaveBeenCalledWith({ where: { id: 'intake-1' }, data: { otherAmounts: [existing, { label: existing.label, amount: 82400 }] } });
      mockPrisma.intake.update.mockClear();
      await confirm('otherAmount', JSON.stringify(existing));
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
      expect(mockPrisma.intakeFieldProposal.update).toHaveBeenCalled();
    });

    it.each([['otherAmount', '100'], ['otherAmount', '{"label":"","amount":2}'], ['estimatedDamage', 'NaN'], ['insurerPaidAmount', ''], ['settlementOfferAmount', '-1'], ['incidentDate', '2026-02-31'], ['requestedResponseDate', 'bad']])('rejects invalid %s value %s before confirming', async (field, value) => {
      await expect(confirm(field, value)).rejects.toThrow(BadRequestException);
      expect(mockPrisma.intakeFieldProposal.update).not.toHaveBeenCalled();
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
    });

    it('applies a document category, clean filename with original extension and received request atomically', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'd1', filename: 'scan.PDF' });
      mockPrisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'r1' });
      await confirm('document', JSON.stringify({ documentId: 'd1', category: 'MEDICAL', filename: '../เวชระเบียน.jpg', docRequestId: 'r1', docTypeLabel: 'เวชระเบียน' }));
      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'd1', intakeId: 'intake-1' }, select: { id: true, filename: true } });
      expect(mockPrisma.document.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { category: 'MEDICAL', filename: 'เวชระเบียน.PDF' } });
      expect(mockPrisma.intakeDocumentRequest.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { documentId: 'd1', status: 'RECEIVED', receivedAt: expect.any(Date) } });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does not link a document request from another intake', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'd1', filename: 'scan.pdf' });
      mockPrisma.intakeDocumentRequest.findFirst.mockResolvedValue(null);
      await expect(confirm('document', JSON.stringify({ documentId: 'd1', category: 'MEDICAL', filename: 'เวชระเบียน.pdf', docRequestId: 'other-intake-request' }))).rejects.toThrow(NotFoundException);
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
      expect(mockPrisma.intakeFieldProposal.update).not.toHaveBeenCalled();
    });

    it('does not modify a document from another intake', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);
      await expect(confirm('document', JSON.stringify({ documentId: 'other', category: 'MEDICAL', filename: 'scan.pdf', docRequestId: null }))).rejects.toThrow(NotFoundException);
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
    });
  });

  it('attaches a new thread to the intake case and creates its attachments on that case', async () => {
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', intake: null, messages: [{ id: 'm', direction: 'INBOUND', bodyText: '', attachments: [{ id: 'a', filename: 'new.pdf', mimeType: 'application/pdf', storagePath: 'email/a' }] }] });
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', case: { id: 'case-1' } });
    mockPrisma.document.findMany.mockResolvedValue([{ tags: ['email-attachment:a'] }]);
    expect(await service.attachThreadToIntake(user, 't', 'intake-1')).toEqual({ threadId: 't', intakeId: 'intake-1', caseId: 'case-1' });
    expect(mockPrisma.emailThread.updateMany).toHaveBeenCalledWith({ where: { id: 't', intakeId: null }, data: { intakeId: 'intake-1', caseId: 'case-1', status: 'LINKED', caseUnlinkedAt: null } });
    expect(mockPrisma.document.findMany).toHaveBeenCalledWith({ where: { OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }], tags: { hasSome: ['email-attachment:a'] } }, select: { tags: true } });
    expect(mockPrisma.document.createMany).not.toHaveBeenCalled();
  });

  it('resolves a document and request moved to the intake case, preserving scope', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', case: { id: 'case-1' } });
    mockPrisma.intakeFieldProposal.findFirst.mockResolvedValue({ id: 'p', field: 'document', status: 'SUGGESTED', sourceDocumentId: 'd', proposedValue: JSON.stringify({ documentId: 'd', filename: 'สัญญา.pdf', category: 'CONTRACT', docRequestId: 'r' }) });
    mockPrisma.document.findFirst.mockResolvedValue({ id: 'd', filename: 'scan.pdf' });
    mockPrisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'r' });
    await service.resolveFieldProposal(user, 'intake-1', 'p', { action: 'confirm' });
    expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'd', OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }] }, select: { id: true, filename: true } });
    expect(mockPrisma.intakeDocumentRequest.findFirst).toHaveBeenCalledWith({ where: { id: 'r', OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }] }, select: { id: true } });
    expect(mockPrisma.intakeDocumentRequest.update).toHaveBeenCalledWith({ where: { id: 'r' }, data: { documentId: 'd', status: 'RECEIVED', receivedAt: expect.any(Date) } });
  });

  it('dedupes proposed document requests against either link and creates new requests on the case', async () => {
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', case: { id: 'case-1' } });
    mockPrisma.intakeFieldProposal.findFirst.mockResolvedValue({ id: 'p', field: 'docRequest', status: 'SUGGESTED', proposedValue: 'สัญญา' });
    mockPrisma.intakeDocumentRequest.findFirst.mockResolvedValueOnce({ id: 'r' }).mockResolvedValueOnce(null);
    await service.resolveFieldProposal(user, 'intake-1', 'p', { action: 'confirm' });
    expect(mockPrisma.intakeDocumentRequest.findFirst).toHaveBeenCalledWith({ where: { OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }], name: 'สัญญา' }, select: { id: true } });
    expect(mockPrisma.intakeDocumentRequest.create).not.toHaveBeenCalled();
    await service.resolveFieldProposal(user, 'intake-1', 'p', { action: 'confirm' });
    expect(mockPrisma.intakeDocumentRequest.create).toHaveBeenCalledWith({ data: { caseId: 'case-1', name: 'สัญญา', createdById: 'user-1' } });
  });

  it('suggests an intake only for exactly one accessible open match, in one batched query', async () => {
    const base = { subject: 'mail', _count: { messages: 1 }, intake: null, caseId: null };
    mockPrisma.emailThread.findMany.mockResolvedValue([
      { ...base, id: 't1', fromAddress: 'ONE@example.com' },
      { ...base, id: 't2', fromAddress: 'two@example.com' },
      { ...base, id: 't3', fromAddress: 'none@example.com' },
      { ...base, id: 't4', fromAddress: 'one@example.com', intake: { id: 'already' } },
      { ...base, id: 't5', fromAddress: 'one@example.com', caseId: 'case' },
    ]);
    mockPrisma.intake.findMany.mockResolvedValue([
      { id: 'i1', title: null, emailThreads: [{ fromAddress: 'one@example.com' }, { fromAddress: 'ONE@example.com' }] },
      { id: 'i2', title: '2', emailThreads: [{ fromAddress: 'two@example.com' }] },
      { id: 'i3', title: '3', emailThreads: [{ fromAddress: 'two@example.com' }] },
    ]);
    const result = await service.listThreads(user);
    expect(result.map((r) => r.suggestedIntake)).toEqual([{ id: 'i1', title: null }, null, null, null, null]);
    expect(mockPrisma.intake.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.intake.findMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([{ firmId: 'firm-1' }, { OR: [
      { status: { notIn: ['REJECTED', 'CONVERTED', 'CONSULTED'] } },
      { status: 'CONVERTED', case: { deletedAt: null, status: { notIn: ['CLOSED', 'ARCHIVED'] } } },
    ] }]));
    expect(mockPrisma.intake.findMany.mock.calls[0][0].where.AND[2].emailThreads.some.OR[0]).toEqual({ fromAddress: { equals: 'one@example.com', mode: 'insensitive' } });
  });

  it('offers a converted intake of an open case when the sender starts a fresh thread', async () => {
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 'new', subject: 'Claim', fromAddress: 'client@example.com', intake: null, messages: [] });
    mockPrisma.intake.findMany.mockResolvedValue([{ id: 'converted', title: 'Claim', status: 'CONVERTED' }]);
    expect(await service.suggestIntakesForThread(user, 'new')).toEqual([{ id: 'converted', title: 'Claim', status: 'CONVERTED' }]);
    expect(mockPrisma.intake.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { firmId: 'firm-1' },
      { OR: [
        { status: { notIn: ['REJECTED', 'CONVERTED', 'CONSULTED'] } },
        { status: 'CONVERTED', case: { deletedAt: null, status: { notIn: ['CLOSED', 'ARCHIVED'] } } },
      ] },
      { OR: expect.any(Array) },
    ] } }));
  });

  it('copies inbound attachments once when the thread is accepted, and never again on a repeat', async () => {
    const attachment = { id: 'a1', filename: 'scan.pdf', mimeType: 'application/pdf', storagePath: 'email/a1.pdf' };
    mockPrisma.emailThread.findFirst.mockResolvedValueOnce({ id: 't', intake: null, subject: 's', fromName: 'A', fromAddress: 'a@x.test', messages: [
      { id: 'm', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyText: '', attachments: [attachment] },
      { id: 'o', direction: 'OUTBOUND', toAddresses: [], ccAddresses: [], bodyText: '', attachments: [{ ...attachment, id: 'out' }] },
    ] });
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
    mockPrisma.document.findMany.mockResolvedValue([]);
    await service.acceptIntakeFromThread(user, 't', {});
    expect(mockPrisma.document.createMany).toHaveBeenCalledWith({ data: [{ intakeId: 'intake-1', filename: 'scan.pdf', storagePath: 'email/a1.pdf', mimeType: 'application/pdf', category: 'OTHER', tags: ['email-attachment:a1'], uploadedById: 'user-1' }] });
    expect(mockStorage.getBuffer).not.toHaveBeenCalled();

    // A file the lawyer then removed must not come back on a repeated accept or link.
    mockPrisma.document.createMany.mockClear();
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', intake: { id: 'intake-1' }, messages: [{ direction: 'INBOUND', toAddresses: [], ccAddresses: [], attachments: [attachment] }] });
    await service.acceptIntakeFromThread(user, 't', {});
    await service.attachThreadToIntake(user, 't', 'intake-1');
    expect(mockPrisma.document.createMany).not.toHaveBeenCalled();
  });

  it('copies files and proposes before opening, so a plan-limit retry retains the original evidence', async () => {
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', intake: null, subject: 's', fromName: null, messages: [{ id: 'm', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyText: 'เรียกร้อง 200,000 บาท', attachments: [{ id: 'a', filename: 'proof.pdf', mimeType: 'application/pdf', storagePath: 'email/a' }] }] });
    mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
    mockIntake.openPreLitCase.mockRejectedValueOnce(new Error('plan limit'));
    await expect(service.acceptIntakeFromThread(user, 't', {})).rejects.toThrow('plan limit');
    expect(mockPrisma.document.createMany).toHaveBeenCalled();
    expect(mockPrisma.intakeFieldProposal.createMany).toHaveBeenCalled();
    expect(mockPrisma.document.createMany.mock.invocationCallOrder[0]).toBeLessThan(mockIntake.openPreLitCase.mock.invocationCallOrder[0]);
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', intake: { id: 'intake-1' }, messages: [] });
    expect(await service.acceptIntakeFromThread(user, 't', {})).toMatchObject({ caseId: 'case-1' });
    expect(mockPrisma.document.createMany).toHaveBeenCalledTimes(1);
  });

  it('strips quoted history and signature on accept and retains only sender attribution', async () => {
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', fromName: 'Thread sender', fromAddress: 'thread@example.com', subject: 'x', messages: [
      { id: 'm', direction: 'INBOUND', toAddresses: [], ccAddresses: [], fromName: 'Nathamon Chanitaphat', fromAddress: 'risk@example.com', attachments: [], bodyText: 'กรุณาตรวจยอด\n\nNathamon Chanitaphat\nRisk management Manager\nKasemrad Ramkhamhaeng Hospital\n02-339-0000 ต่อ 4006\n\nFrom: Old <old@example.com>\nSent: Tuesday\nold history' },
    ] });
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
    await service.acceptIntakeFromThread(user, 't', {});
    expect(mockPrisma.intake.create.mock.calls[0][0].data.description).toBe('กรุณาตรวจยอด\n\n— Nathamon Chanitaphat <risk@example.com>');
  });

  it.each([undefined, 'case-1'])("returns progress and this thread's documents without storage paths (case=%s)", async (caseId) => {
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', case: caseId ? { id: caseId } : null, intake: { id: 'intake-1', status: 'RECEIVED', case: caseId ? { id: caseId } : null }, messages: [{ direction: 'INBOUND', toAddresses: [], ccAddresses: [], attachments: [{ id: 'a1' }] }] });
    mockPrisma.document.findMany.mockResolvedValue([{ id: 'd1', filename: 'scan.pdf', mimeType: 'application/pdf', category: 'OTHER', storagePath: 'private' }]);
    mockPrisma.auditLog.findFirst.mockResolvedValue({ id: 'audit' });
    const result = await service.getThread(user, 't');
    expect(result.documents).toEqual([{ id: 'd1', filename: 'scan.pdf', mimeType: 'application/pdf', category: 'OTHER' }]);
    expect(result.progress.steps.map((step) => step.state)).toEqual(['done', 'done', 'done', 'done', caseId ? 'done' : 'current']);
    expect(mockPrisma.document.findMany.mock.calls[0][0].where).toEqual({ ...(caseId ? { OR: [{ intakeId: 'intake-1' }, { caseId }] } : { intakeId: 'intake-1' }), tags: { hasSome: ['email-attachment:a1'] } });
  });

  describe('explicit AI reading', () => {
    afterEach(() => jest.restoreAllMocks());

    it('reads up to twelve files three at a time, never inline pictures, caps and redacts all text, creates only pending proposals', async () => {
      const files = Array.from({ length: 13 }, (_, i) => ({ id: `d${i}`, filename: `patient@example.com-${i}.pdf`, mimeType: 'application/pdf', storagePath: `email/${i}.pdf`, category: 'OTHER' }));
      mockConfig.get.mockReturnValue('fake-key');
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', subject: 'patient@example.com', intake: { id: 'intake-1', case: { id: 'case-1' } }, messages: [
        { id: 'm1', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyText: 'กรุณาตรวจ patient@example.com 0812345678', attachments: [{ id: 'a' }] },
        { id: 'out', direction: 'OUTBOUND', toAddresses: [], ccAddresses: [], bodyText: 'private outbound', attachments: [] },
      ] });
      mockPrisma.document.findMany.mockResolvedValue(files);
      mockPrisma.intakeDocumentRequest.findMany.mockResolvedValue([{ id: 'r1', name: 'เวชระเบียน patient@example.com' }]);
      mockStorage.getBuffer.mockResolvedValue(Buffer.from('file'));
      let active = 0;
      let peak = 0;
      mockIntelligence.extractTextWithOcr.mockImplementation(async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return 'จ่าย 82,400 บาท patient@example.com 0812345678 ' + 'ก'.repeat(7000) + 'AFTER_CAP';
      });
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ matters: [{ label: 'เรื่อง', insurerPaidAmount: { amount: 82400, quote: 'จ่าย 82,400 บาท', sourceDocumentId: 'd0', sourceMessageId: null } }], documents: [{ documentId: 'd0', category: 'MEDICAL', docTypeLabel: 'เวชระเบียน', suggestedFilename: 'เวชระเบียน.pdf', docRequestName: 'เวชระเบียน [อีเมล]' }] }) } }] })));
      await expect(service.aiExtract(user, 't')).resolves.toEqual({ proposals: 2, cached: false });
      // Unreviewed guesses for the same messages/files are replaced, so amounts don't show twice.
      expect(mockPrisma.intakeFieldProposal.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({
        status: { in: ['SUGGESTED', 'REQUIRES_CONFIRMATION'] },
      }) });
      expect(mockStorage.getBuffer).toHaveBeenCalledTimes(12);
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }], tags: { hasSome: ['email-attachment:a'] } } }));
      expect(mockPrisma.intakeDocumentRequest.findMany).toHaveBeenCalledWith({ where: { OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }] }, select: { id: true, name: true } });
      // Logos/pasted pictures (Outlook isInline) never load with the thread, so they never become files.
      expect(mockPrisma.emailThread.findFirst.mock.calls[0][0].include.messages.include.attachments).toEqual({ where: { isInline: false } });
      expect(peak).toBe(3);
      expect(mockIntelligence.extractTextWithOcr).toHaveBeenCalledWith(Buffer.from('file'), 'application/pdf', { documentId: 'd0', firmId: 'firm-1' });
      const request = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(request.model).toBe('gpt-6-luna');
      expect(request).not.toHaveProperty('temperature');
      expect(request.response_format.json_schema.strict).toBe(true);
      const payload = JSON.parse(request.messages[1].content);
      expect(payload.documents).toHaveLength(12);
      expect(payload.messages).toHaveLength(1);
      expect(request.messages[1].content).not.toMatch(/patient@example.com|0812345678|AFTER_CAP|private outbound/);
      expect(request.messages[1].content).toContain('[อีเมล]');
      expect(request.messages[1].content).toContain('[เบอร์โทร]');
      const proposals = mockPrisma.intakeFieldProposal.createMany.mock.calls[0][0].data;
      expect(proposals.every((p: any) => p.status === 'REQUIRES_CONFIRMATION')).toBe(true);
      expect(proposals[0]).toMatchObject({ sourceType: 'ATTACHMENT', sourceDocumentId: 'd0', sourceEmailMessageId: null, field: 'insurerPaidAmount', proposedValue: '82400' });
      expect(JSON.parse(proposals[1].proposedValue).docRequestId).toBe('r1');
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
      expect(mockPrisma.document.update).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({ data: { firmId: 'firm-1', userId: 'user-1', action: 'EMAIL_INTAKE_AI_EXTRACTED', metadata: expect.objectContaining({ threadId: 't', intakeId: 'intake-1', proposals: 2, summary: null, cached: false, inputHash: expect.stringMatching(/^[0-9a-f]{64}$/) }) } });
      const stored = mockPrisma.auditLog.create.mock.calls[0][0].data.metadata;

      // Pressing again with nothing changed: the stored result comes back — no OCR, no model call.
      mockPrisma.auditLog.findFirst.mockResolvedValue({ metadata: stored });
      mockIntelligence.extractTextWithOcr.mockClear();
      fetchMock.mockClear();
      await expect(service.aiExtract(user, 't')).resolves.toEqual({ proposals: 2, cached: true });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockIntelligence.extractTextWithOcr).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.findFirst.mock.calls.at(-1)[0].where.AND[1]).toEqual({ metadata: { path: ['inputHash'], equals: stored.inputHash } });
    });

    it('can classify a file-only thread when OCR fails without inventing field values', async () => {
      mockConfig.get.mockReturnValue('fake-key');
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', subject: 'file only', intake: { id: 'intake-1' }, messages: [{ id: 'm', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyText: null, attachments: [{ id: 'a' }] }] });
      mockPrisma.document.findMany.mockResolvedValue([{ id: 'd', filename: 'scan.pdf', mimeType: 'application/pdf', storagePath: 'email/a.pdf' }]);
      mockStorage.getBuffer.mockRejectedValue(new Error('unavailable'));
      jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ matters: [], documents: [{ documentId: 'd', category: 'OTHER', docTypeLabel: 'เอกสารแนบ', suggestedFilename: 'เอกสารแนบ.pdf', docRequestName: null }] }) } }] })));
      await expect(service.aiExtract(user, 't')).resolves.toEqual({ proposals: 1, cached: false });
      expect(mockPrisma.intakeFieldProposal.createMany.mock.calls[0][0].data[0].field).toBe('document');
      expect(mockPrisma.intake.update).not.toHaveBeenCalled();
    });

    it('does not read linked intake documents without intake access', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', intake: { id: 'other' }, messages: [] });
      mockPrisma.intake.findFirst.mockResolvedValue(null);
      await expect(service.aiExtract(user, 't')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
      expect(mockStorage.getBuffer).not.toHaveBeenCalled();
    });
  });


  describe('client for the intake', () => {
    const body = 'กรุณาตรวจยอด\n\nNathamon Chanitaphat\nRisk management Manager\nKasemrad Ramkhamhaeng Hospital\n02-339-0000 ต่อ 4006';
    const thread = { id: 't', fromName: 'Nathamon', fromAddress: 'Nathamon.Cha@kasemrad.co.th', intake: { id: 'intake-1' }, messages: [{ direction: 'INBOUND', bodyText: body, attachments: [], fromName: 'Nathamon', fromAddress: 'Nathamon.Cha@kasemrad.co.th', toAddresses: ['me@firm.test'], ccAddresses: [] }] };

    it('offers the signature organisation as the new client name and finds clients by sender e-mail then domain', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.intake.findUnique.mockResolvedValue({ client: null });
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);
      mockPrisma.client.findMany
        .mockResolvedValueOnce([{ id: 'c1', name: 'รพ.เกษมราษฎร์ รามคำแหง' }])
        .mockResolvedValueOnce([{ id: 'c1', name: 'รพ.เกษมราษฎร์ รามคำแหง' }, { id: 'c2', name: 'Kasemrad Group' }])
        .mockResolvedValueOnce([]);
      const { clientMatch } = await service.getThread(user, 't') as any;
      expect(clientMatch).toEqual({ linked: null, suggestedName: 'Kasemrad Ramkhamhaeng Hospital', candidates: [
        { id: 'c1', name: 'รพ.เกษมราษฎร์ รามคำแหง', reason: 'EMAIL' }, { id: 'c2', name: 'Kasemrad Group', reason: 'DOMAIN' }] });
      expect(mockPrisma.client.findMany.mock.calls[0][0].where).toMatchObject({ firmId: 'firm-1' });
    });

    it('creates a new client with the sender as its contact and links the intake', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.client.create.mockResolvedValue({ id: 'new', name: 'Kasemrad Ramkhamhaeng Hospital' });
      mockPrisma.intake.update.mockResolvedValue({ contactName: null });
      await service.linkClientForThread(user, 't', { name: ' Kasemrad Ramkhamhaeng Hospital ' });
      expect(mockPrisma.client.create).toHaveBeenCalledWith({ data: { firmId: 'firm-1', name: 'Kasemrad Ramkhamhaeng Hospital',
        contacts: { create: [{ name: 'Nathamon', email: 'Nathamon.Cha@kasemrad.co.th', isPrimary: true }] } }, select: { id: true, name: true } });
      expect(mockPrisma.intake.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'intake-1' }, data: { clientId: 'new', clientName: 'Kasemrad Ramkhamhaeng Hospital' } }));
    });

    it('links an existing client of this firm only, adding the sender as a contact once', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.client.findFirst.mockResolvedValueOnce({ id: 'c1', name: 'รพ.เกษมราษฎร์' });
      mockPrisma.clientContact.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      // A contact person confirmed before linking joins the client too.
      mockPrisma.intake.update.mockResolvedValue({ contactName: 'จิรญาดา สุทธิวาศ' });
      await service.linkClientForThread(user, 't', { clientId: 'c1' });
      expect(mockPrisma.clientContact.create).toHaveBeenCalledWith({ data: { clientId: 'c1', name: 'จิรญาดา สุทธิวาศ', isPrimary: false } });
      expect(mockPrisma.client.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c1', firmId: 'firm-1' } }));
      expect(mockPrisma.clientContact.create).toHaveBeenCalledWith({ data: { clientId: 'c1', name: 'Nathamon', email: 'Nathamon.Cha@kasemrad.co.th', isPrimary: false } });

      mockPrisma.client.findFirst.mockResolvedValueOnce(null);
      await expect(service.linkClientForThread(user, 't', { clientId: 'other-firm' })).rejects.toThrow(NotFoundException);
      await expect(service.linkClientForThread(user, 't', {})).rejects.toThrow(BadRequestException);
    });
  });

  it('repairs cid: images of an older synced message when the thread is opened', async () => {
    mockPrisma.emailThread.findFirst.mockResolvedValue({ id: 't', mailboxConnectionId: 'mb', intake: null, messages: [
      { id: 'm1', graphMessageId: 'g1', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyHtml: '<img src="cid:logo">', attachments: [] },
      { id: 'm2', graphMessageId: 'g2', direction: 'INBOUND', toAddresses: [], ccAddresses: [], bodyHtml: '<p>no images</p>', attachments: [] },
    ] });
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    mockOutlookSync.inlineStoredImages.mockImplementation(async (m: { bodyHtml: string }) => m.bodyHtml.replace('cid:logo', 'data:image/png;base64,AA=='));
    const { thread } = await service.getThread(user, 't') as any;
    expect(thread.messages[0].bodyHtml).toBe('<img src="data:image/png;base64,AA==">');
    expect(mockOutlookSync.inlineStoredImages).toHaveBeenCalledTimes(1);
    expect(mockOutlookSync.inlineStoredImages).toHaveBeenCalledWith({ id: 'm1', graphMessageId: 'g1', bodyHtml: '<img src="cid:logo">' }, 'mb');
  });
});
