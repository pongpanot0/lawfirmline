import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClientPortalIntakeService } from './client-portal-intake.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ClientPortalIntakeService', () => {
  let service: ClientPortalIntakeService;
  const mockPrisma = {
    portalIntakeSubmission: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    portalIntakeAttachment: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const mockConfig = { get: jest.fn() };
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
        ClientPortalIntakeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    service = module.get(ClientPortalIntakeService);
  });

  describe('submit', () => {
    it('creates a submission scoped to the authenticated contact and client, never trusting a client-supplied clientId', async () => {
      mockPrisma.portalIntakeSubmission.count.mockResolvedValue(0);
      mockPrisma.portalIntakeSubmission.create.mockResolvedValue({
        id: 'sub-1',
        referenceNumber: 'REQ-000001',
        clientId: 'client-1',
        clientContactId: 'contact-1',
        title: 'ขอคำปรึกษาเรื่องสัญญา',
        detail: 'รายละเอียด',
        urgencyFlag: false,
        withdrawnByClient: false,
        submittedAt: new Date('2026-09-05'),
      });

      const result = await service.submit(portalUser, {
        title: 'ขอคำปรึกษาเรื่องสัญญา',
        detail: 'รายละเอียด',
      });

      expect(mockPrisma.portalIntakeSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client-1',
            clientContactId: 'contact-1',
            title: 'ขอคำปรึกษาเรื่องสัญญา',
          }),
        }),
      );
      expect(result.referenceNumber).toMatch(/^REQ-\d{6}$/);
    });
  });

  describe('listMine', () => {
    it('only returns submissions belonging to the authenticated contact', async () => {
      mockPrisma.portalIntakeSubmission.findMany.mockResolvedValue([
        { id: 'sub-1', clientContactId: 'contact-1', intakeId: null, intake: null },
      ]);

      await service.listMine(portalUser);

      expect(mockPrisma.portalIntakeSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientContactId: 'contact-1' }),
        }),
      );
    });
  });
});
