import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';

describe('EmailIntakeService', () => {
  let service: EmailIntakeService;
  const mockPrisma = {
    emailThread: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    emailMessage: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    intake: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    intakeFieldProposal: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    client: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const mockCaseAccess = {
    getEmailThreadFilterForUser: jest.fn(async (user: { firmId: string }) => ({
      firmId: user.firmId,
    })),
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue({ firmId: 'firm-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailIntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
      ],
    }).compile();
    service = module.get(EmailIntakeService);
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

    it('list excerpt uses the latest INBOUND message, else the newest', async () => {
      mockPrisma.emailThread.findMany.mockResolvedValue([
        { id: 't1', subject: 'a', lastMessageAt: new Date(), status: 'NEW', _count: { messages: 2 }, intake: null,
          messages: [{ id: 'out', bodyText: 'ทนายตอบ', attachments: [] }] },
        { id: 't2', subject: 'b', lastMessageAt: new Date(), status: 'NEW', _count: { messages: 1 }, intake: null,
          messages: [{ id: 'o2', bodyText: 'ส่งออกอย่างเดียว', attachments: [] }] },
      ]);
      mockPrisma.emailMessage.findMany.mockResolvedValue([
        { id: 'in', threadId: 't1', bodyText: 'ลูกความถาม', attachments: [{ id: 'a1' }] },
      ]);
      const list = await service.listThreads(user);
      expect(list[0]).toMatchObject({ bodyExcerpt: 'ลูกความถาม', attachmentCount: 1 });
      expect(list[1].bodyExcerpt).toBe('ส่งออกอย่างเดียว');
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
