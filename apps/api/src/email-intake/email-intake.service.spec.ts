import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailIntakeService } from './email-intake.service';
import { PrismaService } from '../prisma/prisma.module';

describe('EmailIntakeService', () => {
  let service: EmailIntakeService;
  const mockPrisma = {
    emailThread: { findFirst: jest.fn(), update: jest.fn() },
    emailMessage: { create: jest.fn(), findUnique: jest.fn() },
    intake: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    intakeFieldProposal: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      createMany: jest.fn(),
    },
    client: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailIntakeService, { provide: PrismaService, useValue: mockPrisma }],
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

  describe('assertReadyForAcceptance', () => {
    it('blocks acceptance while a proposal still requires confirmation', async () => {
      mockPrisma.intakeFieldProposal.count.mockResolvedValue(1);
      await expect(service.assertReadyForAcceptance('intake-1')).rejects.toThrow(BadRequestException);
    });

    it('allows acceptance once everything is resolved', async () => {
      mockPrisma.intakeFieldProposal.count.mockResolvedValue(0);
      await expect(service.assertReadyForAcceptance('intake-1')).resolves.toBeUndefined();
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
