import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ContactCaseAccessService } from './contact-case-access.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ContactCaseAccessService', () => {
  let service: ContactCaseAccessService;
  const mockPrisma = {
    case: { findFirst: jest.fn() },
    clientContact: { findFirst: jest.fn() },
    contactCaseAccess: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactCaseAccessService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(ContactCaseAccessService);
  });

  describe('grant', () => {
    it('throws NotFoundException when the case does not belong to the requesting firm', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      await expect(
        service.grant(user, 'case-1', { clientContactId: 'contact-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.case.findFirst).toHaveBeenCalledWith({
        where: { id: 'case-1', firmId: 'firm-1' },
      });
    });

    it('throws NotFoundException when the contact does not belong to the case client', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({
        id: 'case-1',
        firmId: 'firm-1',
        clientId: 'client-1',
      });
      mockPrisma.clientContact.findFirst.mockResolvedValue(null);

      await expect(
        service.grant(user, 'case-1', { clientContactId: 'contact-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.clientContact.findFirst).toHaveBeenCalledWith({
        where: { id: 'contact-1', clientId: 'client-1' },
      });
      expect(mockPrisma.contactCaseAccess.upsert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the case has no client', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({
        id: 'case-1',
        firmId: 'firm-1',
        clientId: null,
      });

      await expect(
        service.grant(user, 'case-1', { clientContactId: 'contact-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.clientContact.findFirst).not.toHaveBeenCalled();
    });

    it('upserts an access grant when the contact belongs to the case client', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({
        id: 'case-1',
        firmId: 'firm-1',
        clientId: 'client-1',
      });
      mockPrisma.clientContact.findFirst.mockResolvedValue({ id: 'contact-1', clientId: 'client-1' });
      mockPrisma.contactCaseAccess.upsert.mockResolvedValue({ id: 'access-1' });

      await service.grant(user, 'case-1', { clientContactId: 'contact-1' });

      expect(mockPrisma.contactCaseAccess.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientContactId_caseId: { clientContactId: 'contact-1', caseId: 'case-1' } },
          create: expect.objectContaining({
            caseId: 'case-1',
            clientContactId: 'contact-1',
            grantedById: 'user-1',
          }),
          update: expect.objectContaining({
            revokedAt: null,
            revokedById: null,
            grantedById: 'user-1',
          }),
        }),
      );
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException when the access row does not belong to the given case', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', firmId: 'firm-1' });
      mockPrisma.contactCaseAccess.findFirst.mockResolvedValue(null);

      await expect(service.revoke(user, 'case-1', 'access-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.contactCaseAccess.findFirst).toHaveBeenCalledWith({
        where: { id: 'access-1', caseId: 'case-1' },
      });
    });

    it('sets revokedAt and revokedById when the access row is found', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ id: 'case-1', firmId: 'firm-1' });
      mockPrisma.contactCaseAccess.findFirst.mockResolvedValue({ id: 'access-1' });
      mockPrisma.contactCaseAccess.update.mockResolvedValue({ id: 'access-1' });

      await service.revoke(user, 'case-1', 'access-1');

      expect(mockPrisma.contactCaseAccess.update).toHaveBeenCalledWith({
        where: { id: 'access-1' },
        data: { revokedAt: expect.any(Date), revokedById: 'user-1', endDate: expect.any(Date) },
      });
    });
  });
});
