import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { ClientPortalAuthService } from './client-portal-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';

describe('ClientPortalAuthService password flow', () => {
  let service: ClientPortalAuthService;
  const mockPrisma = {
    clientContact: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    clientPortalLoginToken: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const mockJwt = { sign: jest.fn().mockReturnValue('jwt-token') };
  const mockConfig = { get: jest.fn().mockReturnValue('secret') };
  const mockEmail = {
    getAppUrl: jest.fn().mockReturnValue('http://localhost:3005'),
    sendClientPortalMagicLinkEmail: jest.fn(),
  };

  const contact = {
    id: 'contact-1',
    name: 'John',
    email: 'john.smith@email.com',
    portalEnabled: true,
    passwordHash: null as string | null,
    clientId: 'client-1',
    client: { id: 'client-1', name: 'John Smith', firmId: 'firm-1', firm: { name: 'Firm' } },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.clientContact.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientPortalAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();
    service = module.get(ClientPortalAuthService);
  });

  describe('loginWithPassword', () => {
    it('rejects when the contact has no password yet', async () => {
      mockPrisma.clientContact.findFirst.mockResolvedValue({ ...contact, passwordHash: null });

      await expect(service.loginWithPassword(contact.email!, 'secret1')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns a session when email and password match', async () => {
      const passwordHash = await bcrypt.hash('secret1', 4);
      mockPrisma.clientContact.findFirst.mockResolvedValue({ ...contact, passwordHash });

      const session = await service.loginWithPassword(contact.email!, 'secret1');

      expect(session.accessToken).toBe('jwt-token');
      expect(session.contact.hasPassword).toBe(true);
    });
  });

  describe('setPassword', () => {
    it('stores a bcrypt hash for the authenticated contact', async () => {
      const result = await service.setPassword(
        {
          clientContactId: 'contact-1',
          clientId: 'client-1',
          firmId: 'firm-1',
          name: 'John',
          email: contact.email,
        },
        'secret1',
      );

      expect(result).toEqual({ hasPassword: true });
      const data = mockPrisma.clientContact.updateMany.mock.calls[0][0].data;
      expect(await bcrypt.compare('secret1', data.passwordHash)).toBe(true);
    });

    it('fails when portal access was revoked', async () => {
      mockPrisma.clientContact.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.setPassword(
          {
            clientContactId: 'contact-1',
            clientId: 'client-1',
            firmId: 'firm-1',
            name: 'John',
            email: contact.email,
          },
          'secret1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
