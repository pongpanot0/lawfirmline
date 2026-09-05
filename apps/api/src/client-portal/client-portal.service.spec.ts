import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';

describe('ClientPortalService case-access scoping', () => {
  let service: ClientPortalService;
  const mockPrisma = {
    client: { findUnique: jest.fn() },
    case: { findMany: jest.fn(), findFirst: jest.fn() },
    calendarEvent: { findFirst: jest.fn() },
    document: { findMany: jest.fn(), findFirst: jest.fn() },
    invoice: { findMany: jest.fn() },
  };
  const mockDocumentsService = { getFilePath: jest.fn() };
  const now = new Date();
  const portalUser = {
    clientContactId: 'contact-1',
    clientId: 'client-1',
    firmId: 'firm-1',
    name: 'ทดสอบ',
    email: 'test@example.com',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    }).compile();
    service = module.get(ClientPortalService);
  });

  describe('getCases', () => {
    it('only queries cases the contact has an active ContactCaseAccess grant for, not all cases for the client', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);

      await service.getCases(portalUser);

      const callArg = mockPrisma.case.findMany.mock.calls[0][0];
      expect(callArg.where).toEqual(
        expect.objectContaining({
          contactAccess: expect.objectContaining({
            some: expect.objectContaining({
              clientContactId: 'contact-1',
            }),
          }),
        }),
      );
    });
  });

  describe('getCase', () => {
    it('throws NotFoundException when the contact has no active access grant for that case, even if the case belongs to the same client', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);

      await expect(service.getCase(portalUser, 'case-1')).rejects.toThrow(NotFoundException);

      const callArg = mockPrisma.case.findFirst.mock.calls[0][0];
      expect(callArg.where.contactAccess).toEqual(
        expect.objectContaining({
          some: expect.objectContaining({ clientContactId: 'contact-1' }),
        }),
      );
    });
  });
});
