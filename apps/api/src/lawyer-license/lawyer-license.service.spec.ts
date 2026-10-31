import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma';
import { FirmRole, LawyerLicenseType } from '@lawfirm/shared';
import { LawyerLicenseService } from './lawyer-license.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';

const NOW = new Date('2026-11-02T03:00:00.000Z'); // 10:00 Bangkok, 90 days before 2027-01-31
const date = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe('LawyerLicenseService', () => {
  let service: LawyerLicenseService;
  const mockTx = { user: { update: jest.fn() }, auditLog: { create: jest.fn() } };
  const mockPrisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    firmMember: { findUnique: jest.fn(), findMany: jest.fn() },
    lawyerLicenseReminderLog: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  };
  const notifier = { notifyAssigned: jest.fn() };
  const manager = { id: 'om-1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;
  const lawyer = { id: 'u-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;

  const licensed = (overrides: Record<string, unknown> = {}) => ({
    id: 'u-1',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    lawyerLicenseNo: '12345/2560',
    lawyerLicenseExpiresAt: date('2027-01-31'),
    firmMembers: [{ firmId: 'firm-1' }],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
    mockPrisma.lawyerLicenseReminderLog.findMany.mockResolvedValue([]);
    mockPrisma.lawyerLicenseReminderLog.create.mockResolvedValue({});
    mockPrisma.firmMember.findMany.mockResolvedValue([{ userId: 'owner-1' }, { userId: 'om-1' }]);
    const module = await Test.createTestingModule({
      providers: [
        LawyerLicenseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AssignmentNotifierService, useValue: notifier },
      ],
    }).compile();
    service = module.get(LawyerLicenseService);
  });

  describe('sendLicenseReminders', () => {
    it('claims a log row and notifies the lawyer and the office roles of each firm', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed()]);
      await service.sendLicenseReminders(NOW);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { lawyerLicenseType: LawyerLicenseType.TWO_YEAR, lawyerLicenseExpiresAt: { not: null } },
        }),
      );
      expect(mockPrisma.lawyerLicenseReminderLog.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', expiresAt: date('2027-01-31'), milestone: 'OPEN_90' },
      });
      expect(mockPrisma.firmMember.findMany).toHaveBeenCalledWith({
        where: { firmId: 'firm-1', role: { in: [FirmRole.OWNER, FirmRole.OFFICE_MANAGER] } },
        select: { userId: true },
      });
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ firmId: 'firm-1', userIds: ['u-1'], category: 'LICENSE', actorUserId: '' }),
      );
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ firmId: 'firm-1', userIds: ['owner-1', 'om-1'], category: 'LICENSE', entityPath: '/team' }),
      );
    });

    it('does not tell the lawyer twice when they are also an office role', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed()]);
      mockPrisma.firmMember.findMany.mockResolvedValue([{ userId: 'u-1' }, { userId: 'om-1' }]);
      await service.sendLicenseReminders(NOW);
      const officeCall = notifier.notifyAssigned.mock.calls.find((c) => c[0].entityPath === '/team');
      expect(officeCall[0].userIds).toEqual(['om-1']);
    });

    it('notifies the lawyer once but each firm office separately for a multi-firm lawyer', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed({ firmMembers: [{ firmId: 'firm-1' }, { firmId: 'firm-2' }] })]);
      await service.sendLicenseReminders(NOW);
      const selfCalls = notifier.notifyAssigned.mock.calls.filter((c) => c[0].userIds.includes('u-1'));
      const officeCalls = notifier.notifyAssigned.mock.calls.filter((c) => c[0].entityPath === '/team');
      expect(selfCalls).toHaveLength(1);
      expect(officeCalls.map((c) => c[0].firmId)).toEqual(['firm-1', 'firm-2']);
    });

    it('a renewal restarts milestones: logs for the old expiry date are ignored', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed()]);
      mockPrisma.lawyerLicenseReminderLog.findMany.mockResolvedValue([
        { userId: 'u-1', expiresAt: date('2025-01-31'), milestone: 'OPEN_90' },
        { userId: 'u-1', expiresAt: date('2025-01-31'), milestone: 'LATE_45' },
      ]);
      await service.sendLicenseReminders(NOW);
      expect(mockPrisma.lawyerLicenseReminderLog.create).toHaveBeenCalledWith({
        data: { userId: 'u-1', expiresAt: date('2027-01-31'), milestone: 'OPEN_90' },
      });
    });

    it('skips a milestone already logged for the current expiry', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed()]);
      mockPrisma.lawyerLicenseReminderLog.findMany.mockResolvedValue([
        { userId: 'u-1', expiresAt: date('2027-01-31'), milestone: 'OPEN_90' },
      ]);
      await service.sendLicenseReminders(NOW);
      expect(mockPrisma.lawyerLicenseReminderLog.create).not.toHaveBeenCalled();
      expect(notifier.notifyAssigned).not.toHaveBeenCalled();
    });

    it('a duplicate claim (P2002, another instance won) sends nothing', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed()]);
      mockPrisma.lawyerLicenseReminderLog.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await service.sendLicenseReminders(NOW);
      expect(notifier.notifyAssigned).not.toHaveBeenCalled();
    });

    it('one failing user does not stop the others', async () => {
      mockPrisma.user.findMany.mockResolvedValue([licensed(), licensed({ id: 'u-2' })]);
      mockPrisma.lawyerLicenseReminderLog.create
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce({});
      await service.sendLicenseReminders(NOW);
      expect(notifier.notifyAssigned).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u-2'] }));
    });
  });

  describe('updates', () => {
    it('office manager updates a member of the same firm and audits it', async () => {
      mockPrisma.firmMember.findUnique.mockResolvedValue({ firmId: 'firm-1', userId: 'u-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ lawyerLicenseType: null, lawyerLicenseExpiresAt: null });
      await service.updateMember(manager, 'u-1', {
        lawyerLicenseNo: ' 12345/2560 ',
        lawyerLicenseType: LawyerLicenseType.TWO_YEAR,
        lawyerLicenseExpiresAt: '2027-01-31',
      });
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: {
          lawyerLicenseNo: '12345/2560',
          lawyerLicenseType: LawyerLicenseType.TWO_YEAR,
          lawyerLicenseExpiresAt: date('2027-01-31'),
        },
      });
      expect(mockTx.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ firmId: 'firm-1', userId: 'om-1', action: 'LAWYER_LICENSE_UPDATED' }),
      });
    });

    it('a member of another firm is NotFound', async () => {
      mockPrisma.firmMember.findUnique.mockResolvedValue(null);
      await expect(
        service.updateMember(manager, 'other-firm-user', { lawyerLicenseNo: '1' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.firmMember.findUnique).toHaveBeenCalledWith({
        where: { firmId_userId: { firmId: 'firm-1', userId: 'other-firm-user' } },
      });
      expect(mockTx.user.update).not.toHaveBeenCalled();
    });

    it('a lawyer cannot edit someone else', async () => {
      await expect(service.updateMember(lawyer, 'u-2', { lawyerLicenseNo: '1' })).rejects.toThrow(ForbiddenException);
    });

    it('LIFETIME clears the expiry date', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        lawyerLicenseType: LawyerLicenseType.TWO_YEAR,
        lawyerLicenseExpiresAt: date('2027-01-31'),
      });
      await service.updateMine(lawyer, { lawyerLicenseType: LawyerLicenseType.LIFETIME });
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { lawyerLicenseType: LawyerLicenseType.LIFETIME, lawyerLicenseExpiresAt: null },
      });
    });

    it('TWO_YEAR without any expiry date is rejected', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ lawyerLicenseType: null, lawyerLicenseExpiresAt: null });
      await expect(
        service.updateMine(lawyer, { lawyerLicenseType: LawyerLicenseType.TWO_YEAR }),
      ).rejects.toThrow(BadRequestException);
    });

    it('changing only the date keeps the stored TWO_YEAR type', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        lawyerLicenseType: LawyerLicenseType.TWO_YEAR,
        lawyerLicenseExpiresAt: date('2025-01-31'),
      });
      await service.updateMine(lawyer, { lawyerLicenseExpiresAt: '2027-01-31' });
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { lawyerLicenseExpiresAt: date('2027-01-31') },
      });
    });

    it('a date on a LIFETIME licence is rejected', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ lawyerLicenseType: LawyerLicenseType.LIFETIME, lawyerLicenseExpiresAt: null });
      await expect(service.updateMine(lawyer, { lawyerLicenseExpiresAt: '2027-01-31' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
