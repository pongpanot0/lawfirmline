import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CaseMessageService } from './case-message.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { LineMessagingService } from '../notifications/line-messaging.service';
import { LineLinkService } from '../notifications/line-link.service';
import { CaseMessageRateLimiterService } from './case-message-rate-limiter.service';
import { BadRequestException } from '@nestjs/common';

describe('CaseMessageService', () => {
  let service: CaseMessageService;
  const mockPrisma = {
    case: { findFirst: jest.fn() },
    caseMessage: { findMany: jest.fn(), create: jest.fn() },
    contactCaseAccess: { findMany: jest.fn() },
    clientContact: { findMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const mockCaseAccess = { canAccessCase: jest.fn() };
  const mockLine = { pushTo: jest.fn() };
  const mockLineLink = { getLineUserIdsForCase: jest.fn() };
  const mockRateLimiter = { recordSend: jest.fn().mockReturnValue(true) };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;
  const portalUser = { clientContactId: 'contact-1', clientId: 'client-1', firmId: 'firm-1', name: 'x', email: 'x@x.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRateLimiter.recordSend.mockReturnValue(true);
    mockPrisma.auditLog.create.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseMessageService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: LineMessagingService, useValue: mockLine },
        { provide: LineLinkService, useValue: mockLineLink },
        { provide: CaseMessageRateLimiterService, useValue: mockRateLimiter },
      ],
    }).compile();
    service = module.get(CaseMessageService);
  });

  describe('createFromStaff', () => {
    it('throws ForbiddenException when the user cannot access the case', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(false);

      await expect(service.createFromStaff(user, 'case-1', 'hello')).rejects.toThrow(ForbiddenException);
    });

    it('creates a STAFF message and notifies contacts with active case access', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseMessage.create.mockResolvedValue({ id: 'msg-1', body: 'hello' });
      mockPrisma.contactCaseAccess.findMany.mockResolvedValue([{ clientContactId: 'contact-1' }]);
      mockPrisma.clientContact.findMany.mockResolvedValue([{ id: 'contact-1', lineUserId: 'U123' }]);

      await service.createFromStaff(user, 'case-1', 'hello');

      expect(mockPrisma.caseMessage.create).toHaveBeenCalledWith({
        data: { caseId: 'case-1', senderType: 'STAFF', senderUserId: 'user-1', body: 'hello' },
      });
      expect(mockLine.pushTo).toHaveBeenCalledWith('U123', expect.stringContaining('hello'));
    });

    it('throws BadRequestException when the rate limiter denies and does not create the message', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockRateLimiter.recordSend.mockReturnValue(false);

      await expect(service.createFromStaff(user, 'case-1', 'hello')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.caseMessage.create).not.toHaveBeenCalled();
    });

    it('writes an audit log entry after creating the message', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseMessage.create.mockResolvedValue({ id: 'msg-1', body: 'hello' });
      mockPrisma.contactCaseAccess.findMany.mockResolvedValue([]);

      await service.createFromStaff(user, 'case-1', 'hello');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          firmId: 'firm-1',
          userId: 'user-1',
          action: 'CASE_MESSAGE_SENT',
          metadata: { caseId: 'case-1', messageId: 'msg-1', senderType: 'STAFF' },
        },
      });
    });

    it('does not throw when the LINE push fails', async () => {
      mockCaseAccess.canAccessCase.mockResolvedValue(true);
      mockPrisma.caseMessage.create.mockResolvedValue({ id: 'msg-1', body: 'hello' });
      mockPrisma.contactCaseAccess.findMany.mockResolvedValue([{ clientContactId: 'contact-1' }]);
      mockPrisma.clientContact.findMany.mockResolvedValue([{ id: 'contact-1', lineUserId: 'U123' }]);
      mockLine.pushTo.mockRejectedValue(new Error('LINE down'));

      await expect(service.createFromStaff(user, 'case-1', 'hello')).resolves.toEqual(
        expect.objectContaining({ id: 'msg-1' }),
      );
    });
  });

  describe('createFromPortal', () => {
    it('throws NotFoundException when the contact has no active case access', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);

      await expect(service.createFromPortal(portalUser, 'case-1', 'hi')).rejects.toThrow(NotFoundException);
    });

    it('creates a CONTACT message and notifies case-assigned staff', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrisma.caseMessage.create.mockResolvedValue({ id: 'msg-2', body: 'hi' });
      mockLineLink.getLineUserIdsForCase.mockResolvedValue(['U-staff-1']);

      await service.createFromPortal(portalUser, 'case-1', 'hi');

      expect(mockPrisma.caseMessage.create).toHaveBeenCalledWith({
        data: { caseId: 'case-1', senderType: 'CONTACT', senderContactId: 'contact-1', body: 'hi' },
      });
      expect(mockLine.pushTo).toHaveBeenCalledWith('U-staff-1', expect.stringContaining('hi'));
    });

    it('throws BadRequestException when the rate limiter denies and does not create the message', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockRateLimiter.recordSend.mockReturnValue(false);

      await expect(service.createFromPortal(portalUser, 'case-1', 'hi')).rejects.toThrow(BadRequestException);
      expect(mockPrisma.caseMessage.create).not.toHaveBeenCalled();
    });

    it('writes an audit log entry after creating the message', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrisma.caseMessage.create.mockResolvedValue({ id: 'msg-2', body: 'hi' });

      await service.createFromPortal(portalUser, 'case-1', 'hi');

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          firmId: 'firm-1',
          userId: null,
          action: 'CASE_MESSAGE_SENT',
          metadata: { caseId: 'case-1', messageId: 'msg-2', senderType: 'CONTACT', clientContactId: 'contact-1' },
        },
      });
    });
  });

  describe('listForPortal', () => {
    it('throws NotFoundException when the contact has no active case access', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);

      await expect(service.listForPortal(portalUser, 'case-1')).rejects.toThrow(NotFoundException);
    });

    it('returns messages ordered oldest-first when access is valid', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1' });
      mockPrisma.caseMessage.findMany.mockResolvedValue([{ id: 'msg-1' }]);

      const result = await service.listForPortal(portalUser, 'case-1');

      expect(mockPrisma.caseMessage.findMany).toHaveBeenCalledWith({
        where: { caseId: 'case-1' },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([{ id: 'msg-1' }]);
    });
  });
});
