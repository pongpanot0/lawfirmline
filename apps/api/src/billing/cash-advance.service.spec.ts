import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CashAdvanceService } from './cash-advance.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PrismaService } from '../prisma/prisma.module';

describe('CashAdvanceService', () => {
  let service: CashAdvanceService;
  const mockPrisma = {
    firmMember: { findFirst: jest.fn() },
    cashAdvance: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };
  const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;
  const lawyer = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as AuthUser;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CashAdvanceService, { provide: AssignmentNotifierService, useValue: { notifyAssigned: jest.fn(), notifyFirmOwners: jest.fn() } }, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CashAdvanceService);
  });

  describe('issue', () => {
    it('only the owner can issue an advance', async () => {
      await expect(service.issue(lawyer, { userId: 'user-2', amount: 1000 })).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.cashAdvance.create).not.toHaveBeenCalled();
    });

    it('rejects a recipient outside the firm', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue(null);
      await expect(service.issue(owner, { userId: 'outsider', amount: 1000 })).rejects.toThrow(NotFoundException);
    });

    it('starts remaining equal to the issued amount', async () => {
      mockPrisma.firmMember.findFirst.mockResolvedValue({ id: 'member-1' });
      await service.issue(owner, { userId: 'user-1', amount: 1500, note: 'ค่าใช้จ่ายศาลต่างจังหวัด' });
      expect(mockPrisma.cashAdvance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ amount: 1500, remaining: 1500, issuedById: 'owner-1' }),
        }),
      );
    });
  });

  describe('list', () => {
    it('lets a non-owner see only their own advances', async () => {
      await expect(service.list(lawyer, 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('scopes a non-owner query to themselves when no userId is given', async () => {
      mockPrisma.cashAdvance.findMany.mockResolvedValue([]);
      await service.list(lawyer);
      expect(mockPrisma.cashAdvance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
      );
    });
  });

  describe('consume', () => {
    const tx = { cashAdvance: { findFirst: jest.fn(), update: jest.fn() } } as any;

    beforeEach(() => jest.clearAllMocks());

    it('rejects an advance that does not belong to this firm/user', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue(null);
      await expect(service.consume(tx, 'firm-1', 'user-1', 'adv-1', 100)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the amount exceeds what remains', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ id: 'adv-1', remaining: 50 });
      await expect(service.consume(tx, 'firm-1', 'user-1', 'adv-1', 100)).rejects.toThrow(BadRequestException);
      expect(tx.cashAdvance.update).not.toHaveBeenCalled();
    });

    it('decrements remaining by the consumed amount', async () => {
      tx.cashAdvance.findFirst.mockResolvedValue({ id: 'adv-1', remaining: 500 });
      await service.consume(tx, 'firm-1', 'user-1', 'adv-1', 200);
      expect(tx.cashAdvance.update).toHaveBeenCalledWith({
        where: { id: 'adv-1' },
        data: { remaining: { decrement: 200 } },
      });
    });
  });
});
