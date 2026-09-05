import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactLineLinkService } from './contact-line-link.service';
import { LineLinkService } from './line-link.service';
import { PrismaService } from '../prisma/prisma.module';

describe('ContactLineLinkService', () => {
  let service: ContactLineLinkService;
  const mockPrisma = {
    clientContact: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const mockLineLink = { getOfficialAccountUrl: jest.fn().mockReturnValue('https://line.me/R/ti/p/@test') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactLineLinkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LineLinkService, useValue: mockLineLink },
      ],
    }).compile();
    service = module.get(ContactLineLinkService);
  });

  describe('createLinkCode', () => {
    it('throws NotFoundException when the contact does not exist', async () => {
      mockPrisma.clientContact.findUnique.mockResolvedValue(null);
      await expect(service.createLinkCode('contact-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when already connected', async () => {
      mockPrisma.clientContact.findUnique.mockResolvedValue({ id: 'contact-1', lineUserId: 'U123' });
      await expect(service.createLinkCode('contact-1')).rejects.toThrow(BadRequestException);
    });

    it('generates and stores a code when not yet connected', async () => {
      mockPrisma.clientContact.findUnique.mockImplementation(({ where }: any) => {
        if (where.id) return Promise.resolve({ id: 'contact-1', lineUserId: null });
        return Promise.resolve(null); // no existing code collision
      });
      mockPrisma.clientContact.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createLinkCode('contact-1');

      expect(result.code).toMatch(/^LF-[A-Z0-9]{6}$/);
      expect(mockPrisma.clientContact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { lineLinkCode: result.code, lineLinkCodeExpiresAt: expect.any(Date) },
      });
    });

    it('retries generating a code when the first attempt collides with an existing contact or user code', async () => {
      mockPrisma.clientContact.findUnique.mockImplementation(({ where }: any) => {
        if (where.id) return Promise.resolve({ id: 'contact-1', lineUserId: null });
        // uniqueness check on lineLinkCode: first call collides, subsequent calls do not
        return uniquenessCallCount++ === 0
          ? Promise.resolve({ id: 'other-contact' })
          : Promise.resolve(null);
      });
      let uniquenessCallCount = 0;
      mockPrisma.clientContact.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.createLinkCode('contact-1');

      expect(result.code).toMatch(/^LF-[A-Z0-9]{6}$/);
      // findUnique on lineLinkCode should have been called more than once (collision then success)
      const uniquenessChecks = mockPrisma.clientContact.findUnique.mock.calls.filter(
        ([arg]: any) => arg?.where?.lineLinkCode,
      );
      expect(uniquenessChecks.length).toBeGreaterThan(1);
    });
  });

  describe('handleIncomingMessage', () => {
    it('returns null for text that does not match the link-code pattern', async () => {
      const result = await service.handleIncomingMessage('U123', 'hello');
      expect(result).toBeNull();
      expect(mockPrisma.clientContact.findFirst).not.toHaveBeenCalled();
    });

    it('links the LINE user when a valid, unexpired code matches', async () => {
      mockPrisma.clientContact.findFirst.mockImplementation(({ where }: any) => {
        if (where.lineLinkCode) {
          return Promise.resolve({
            id: 'contact-1',
            name: 'สมชาย',
            lineLinkCodeExpiresAt: new Date(Date.now() + 60000),
          });
        }
        return Promise.resolve(null); // no other contact already has this lineUserId
      });
      mockPrisma.clientContact.update.mockResolvedValue({});

      const reply = await service.handleIncomingMessage('U123', 'lf-abc123');

      expect(mockPrisma.clientContact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: {
          lineUserId: 'U123',
          lineConnectedAt: expect.any(Date),
          lineLinkCode: null,
          lineLinkCodeExpiresAt: null,
        },
      });
      expect(reply).toContain('สำเร็จ');
    });
  });
});
