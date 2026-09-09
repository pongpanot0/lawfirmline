import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientPortalInviteService } from './client-portal-invite.service';
import { PrismaService } from '../prisma/prisma.module';
import { EmailService } from '../notifications/email.service';

describe('ClientPortalInviteService', () => {
  let service: ClientPortalInviteService;
  const mockPrisma = {
    clientContact: { findFirst: jest.fn(), update: jest.fn() },
    clientPortalInvite: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const mockJwt = { sign: jest.fn().mockReturnValue('signed-jwt') };
  const mockConfig = { get: jest.fn() };
  const mockEmail = {
    getAppUrl: jest.fn().mockReturnValue('https://app.example.com'),
    sendClientPortalInviteEmail: jest.fn().mockResolvedValue(undefined),
  };

  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalInviteService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();
    service = module.get(ClientPortalInviteService);
  });

  describe('createInvite', () => {
    it('rejects a contact from a different firm', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue(null);
      await expect(service.createInvite(user, 'contact-1')).rejects.toThrow(NotFoundException);
    });

    it('rejects a contact with no email on file', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue({
        id: 'contact-1',
        email: null,
        name: 'Somchai',
        client: { name: 'Acme', firm: { name: 'LexFlow' } },
      });
      await expect(service.createInvite(user, 'contact-1')).rejects.toThrow(BadRequestException);
    });

    it('creates an invite and emails the contact', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue({
        id: 'contact-1',
        email: 'somchai@example.com',
        name: 'Somchai',
        client: { name: 'Acme', firm: { name: 'LexFlow' } },
      });
      mockPrisma.clientPortalInvite.create.mockResolvedValue({ id: 'invite-1', expiresAt: new Date() });

      await service.createInvite(user, 'contact-1');

      expect(mockPrisma.clientPortalInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ clientContactId: 'contact-1', invitedById: 'user-1' }) }),
      );
      expect(mockEmail.sendClientPortalInviteEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'somchai@example.com', clientName: 'Acme', firmName: 'LexFlow' }),
      );
    });
  });

  describe('getInvite / acceptInvite', () => {
    const baseInvite = {
      id: 'invite-1',
      clientContactId: 'contact-1',
      acceptedAt: null,
      clientContact: { id: 'contact-1', name: 'Somchai', email: 'somchai@example.com', clientId: 'client-1', client: { id: 'client-1', name: 'Acme', firmId: 'firm-1' } },
    };

    it('rejects an expired invite', async () => {
      mockPrisma.clientPortalInvite.findUnique.mockResolvedValue({
        ...baseInvite,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.getInvite('tok')).rejects.toThrow(BadRequestException);
      await expect(service.acceptInvite('tok')).rejects.toThrow(BadRequestException);
    });

    it('rejects an already-accepted invite', async () => {
      mockPrisma.clientPortalInvite.findUnique.mockResolvedValue({
        ...baseInvite,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      await expect(service.getInvite('tok')).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid invite, enables portal access, and signs a session token', async () => {
      mockPrisma.clientPortalInvite.findUnique.mockResolvedValue({
        ...baseInvite,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      mockPrisma.clientContact.update.mockResolvedValue({
        id: 'contact-1',
        name: 'Somchai',
        email: 'somchai@example.com',
        clientId: 'client-1',
        client: { id: 'client-1', name: 'Acme', firmId: 'firm-1' },
      });

      const result = await service.acceptInvite('tok');

      expect(mockPrisma.clientContact.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'contact-1' }, data: { portalEnabled: true } }),
      );
      expect(mockPrisma.clientPortalInvite.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'invite-1' }, data: { acceptedAt: expect.any(Date) } }),
      );
      expect(result.accessToken).toBe('signed-jwt');
      expect(result.client).toEqual({ id: 'client-1', name: 'Acme' });
      expect(result.contact.hasPassword).toBe(false);
    });
  });
});
