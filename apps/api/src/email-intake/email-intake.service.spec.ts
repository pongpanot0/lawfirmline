import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

describe('EmailIntakeService', () => {
  let service: EmailIntakeService;
  const mockPrisma = {
    emailThread: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    emailMessage: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    intake: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    intakeFieldProposal: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    client: { findMany: jest.fn(), findFirst: jest.fn() },
    emailAttachment: { findFirst: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const mockCaseAccess = {
    getEmailThreadFilterForUser: jest.fn(async (user: { firmId: string }): Promise<any> => ({
      firmId: user.firmId,
    })),
    getIntakeFilterForUser: jest.fn(),
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
    mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailIntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: ConfigService, useValue: { get: jest.fn() } },
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
    it('is idempotent — re-accepting an already-linked thread does not create a second intake', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1',
        intake: { id: 'intake-1' },
        messages: [],
      });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1' });

      const result = await service.acceptIntakeFromThread(user, 'thread-1', {});

      expect(mockPrisma.intake.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'intake-1' });
    });

    it('throws when the thread does not exist for this firm', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(null);
      await expect(service.acceptIntakeFromThread(user, 'missing', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachThreadToIntake (client sent a new e-mail instead of replying)', () => {
    const thread = { id: 'thread-2', intake: null, messages: [{ id: 'in', direction: 'INBOUND', bodyText: 'เรียกร้อง 200,000 บาท', attachments: [] }] };

    it('joins the thread and proposes from its messages', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
      mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.emailThread.updateMany.mockResolvedValue({ count: 1 });

      await service.attachThreadToIntake(user, 'thread-2', 'intake-1');

      expect(mockPrisma.emailThread.updateMany).toHaveBeenCalledWith({
        where: { id: 'thread-2', intakeId: null },
        data: { intakeId: 'intake-1', status: 'LINKED' },
      });
      const created = mockPrisma.intakeFieldProposal.createMany.mock.calls[0][0].data;
      expect(created).toEqual(expect.arrayContaining([expect.objectContaining({ intakeId: 'intake-1', field: 'estimatedDamage', proposedValue: '200000' })]));
    });

    it('refuses an intake this person cannot open', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue(thread);
      mockCaseAccess.getIntakeFilterForUser.mockResolvedValue({ firmId: 'firm-1', marker: 'x' });
      mockPrisma.intake.findFirst.mockResolvedValue(null);

      await expect(service.attachThreadToIntake(user, 'thread-2', 'intake-9')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.intake.findFirst).toHaveBeenCalledWith({ where: { id: 'intake-9', firmId: 'firm-1', marker: 'x' }, select: { id: true } });
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
        id: 'thread-1', intake: null, fromName: 'S', subject: 'x', lastMessageAt: new Date(),
        messages: [
          { id: 'out', direction: 'OUTBOUND', bodyText: 'ตอบกลับจากทนาย', attachments: [] },
          { id: 'in', direction: 'INBOUND', bodyText: 'ข้อความจากลูกความ', attachments: [] },
        ],
      });
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1' });
      await service.acceptIntakeFromThread(user, 'thread-1', {});
      expect(mockPrisma.intake.create.mock.calls[0][0].data.description).toBe('ข้อความจากลูกความ');
    });

    it('falls back to the latest message when a thread has no INBOUND message', async () => {
      mockPrisma.emailThread.findFirst.mockResolvedValue({
        id: 'thread-1', intake: null, fromName: 'S', subject: 'x', lastMessageAt: new Date(),
        messages: [{ id: 'out', direction: 'OUTBOUND', bodyText: 'ตอบกลับจากทนาย', attachments: [] }],
      });
      mockPrisma.client.findMany.mockResolvedValue([]);
      mockPrisma.intake.create.mockResolvedValue({ id: 'intake-1' });
      mockPrisma.intake.findUnique.mockResolvedValue({ id: 'intake-1' });
      await service.acceptIntakeFromThread(user, 'thread-1', {});
      expect(mockPrisma.intake.create.mock.calls[0][0].data.description).toBe('ตอบกลับจากทนาย');
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
});
