import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FirmRole } from '@lawfirm/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClientContactDto } from './dto/client.dto';
import { CLIENT_CONTACT_SELECT } from './client-contact.select';

describe('ClientsService.update contact upsert', () => {
  let service: ClientsService;
  const mockPrisma: any = {
    client: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    clientContact: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  const mockCaseAccess = {
    getClientFilterForUser: jest.fn((user: { firmId: string }) => ({ firmId: user.firmId })),
    getCaseFilterForUser: jest.fn((user: { firmId: string }) => ({ firmId: user.firmId })),
  };
  const user = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.client.findFirst.mockResolvedValue({ id: 'client-1', firmId: 'firm-1' });
    mockCaseAccess.getClientFilterForUser.mockImplementation((u: { firmId: string }) => ({
      firmId: u.firmId,
    }));
    mockCaseAccess.getCaseFilterForUser.mockImplementation((u: { firmId: string }) => ({
      firmId: u.firmId,
    }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
      ],
    }).compile();
    service = module.get(ClientsService);
  });

  it('updates an existing contact in place instead of deleting and recreating it', async () => {
    mockPrisma.clientContact.findMany.mockResolvedValue([
      { id: 'contact-1', clientId: 'client-1' },
    ]);
    mockPrisma.client.update.mockResolvedValue({ id: 'client-1' });

    await service.update(user, 'client-1', {
      contacts: [{ id: 'contact-1', name: 'แก้ไขแล้ว', portalEnabled: true }],
    } as any);

    expect(mockPrisma.clientContact.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.clientContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contact-1' },
        data: expect.objectContaining({ name: 'แก้ไขแล้ว', portalEnabled: true }),
      }),
    );
  });

  it('addContact creates one contact and never touches the others', async () => {
    mockPrisma.clientContact.count.mockResolvedValue(2);
    mockPrisma.clientContact.create.mockResolvedValue({ id: 'contact-new' });

    const out = await service.addContact(user, 'client-1', { name: 'คุณใหม่', email: 'new@x.com' } as any);

    expect(mockPrisma.clientContact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ clientId: 'client-1', name: 'คุณใหม่', email: 'new@x.com', isPrimary: false, portalEnabled: false }),
      select: CLIENT_CONTACT_SELECT,
    });
    expect(mockPrisma.clientContact.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.clientContact.update).not.toHaveBeenCalled();
    expect(out.contact).toEqual({ id: 'contact-new' });
  });

  it('addContact makes the first contact primary, and refuses a client outside the caller’s reach', async () => {
    mockPrisma.clientContact.count.mockResolvedValue(0);
    mockPrisma.clientContact.create.mockResolvedValue({ id: 'c1' });
    await service.addContact(user, 'client-1', { name: 'A' } as any);
    expect(mockPrisma.clientContact.create.mock.calls[0][0].data.isPrimary).toBe(true);

    mockPrisma.client.findFirst.mockResolvedValue(null);
    await expect(service.addContact(user, 'client-x', { name: 'B' } as any)).rejects.toThrow(NotFoundException);
  });

  it('counts only cases visible to the caller in the client list', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    await service.findAll(user);
    expect(mockPrisma.client.findMany.mock.calls[0][0].include._count).toEqual({
      select: { cases: { where: { firmId: 'firm-1' } } },
    });
  });

  it('creates a new contact when no id is supplied', async () => {
    mockPrisma.clientContact.findMany.mockResolvedValue([]);
    mockPrisma.client.update.mockResolvedValue({ id: 'client-1' });

    await service.update(user, 'client-1', {
      contacts: [{ name: 'คนใหม่' }],
    } as any);

    expect(mockPrisma.clientContact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'คนใหม่', clientId: 'client-1' }) }),
    );
  });

  it('deletes only contacts that were removed from the array, not all of them', async () => {
    mockPrisma.clientContact.findMany.mockResolvedValue([
      { id: 'contact-1', clientId: 'client-1' },
      { id: 'contact-2', clientId: 'client-1' },
    ]);
    mockPrisma.client.update.mockResolvedValue({ id: 'client-1' });

    await service.update(user, 'client-1', {
      contacts: [{ id: 'contact-1', name: 'ยังอยู่' }],
    } as any);

    expect(mockPrisma.clientContact.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['contact-2'] } },
    });
  });
});

describe('ClientsService contact round-trip shape', () => {
  it('returns contacts in a shape that ClientContactDto accepts back', async () => {
    const select: Record<string, true> = CLIENT_CONTACT_SELECT;

    // The clients page edits contacts by sending the fetched list straight back
    // to PUT /clients/:id, and the global ValidationPipe rejects unknown keys.
    const sample: Record<string, unknown> = {
      id: 'contact-1',
      name: 'สมชาย',
      nickname: 'ชาย',
      email: 'somchai@example.com',
      phone: '0812345678',
      position: 'CEO',
      isPrimary: true,
      portalEnabled: false,
      notes: 'ติดต่อได้เฉพาะวันทำการ',
    };
    expect(Object.keys(sample).sort()).toEqual(Object.keys(select).sort());

    const contact = plainToInstance(ClientContactDto, sample);
    const errors = await validate(contact, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors.map((e) => e.property)).toEqual([]);
  });

  it('never exposes passwordHash or LINE link tokens on a contact', () => {
    const select: Record<string, true> = CLIENT_CONTACT_SELECT;

    for (const secret of ['passwordHash', 'lineUserId', 'lineLinkCode', 'lineLinkCodeExpiresAt']) {
      expect(select[secret]).toBeUndefined();
    }
  });
});

describe('ClientsService.remove', () => {
  let service: ClientsService;
  const mockPrisma: any = {
    client: { findFirst: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn((cb: any) => cb(mockPrisma)),
  };
  const owner = { id: 'user-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;
  const lawyer = { ...owner, firmRole: FirmRole.LAWYER };
  const counts = (over: Record<string, number> = {}) => ({
    name: 'Test Co',
    _count: { cases: 0, additionalCaseRoles: 0, caseCustomerRoles: 0, billedInvoices: 0, ...over },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: {} },
      ],
    }).compile();
    service = module.get(ClientsService);
  });

  it('deletes a client with nothing live and logs it', async () => {
    mockPrisma.client.findFirst.mockResolvedValue(counts());
    await expect(service.remove(owner, 'client-1')).resolves.toEqual({ deleted: true });
    expect(mockPrisma.client.findFirst.mock.calls[0][0].where).toEqual({ id: 'client-1', firmId: 'firm-1' });
    expect(mockPrisma.client.delete).toHaveBeenCalledWith({ where: { id: 'client-1' } });
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'CLIENT_DELETED', firmId: 'firm-1' });
  });

  it('only lets owners delete', async () => {
    await expect(service.remove(lawyer, 'client-1')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.client.delete).not.toHaveBeenCalled();
  });

  it('404s a client outside the firm', async () => {
    mockPrisma.client.findFirst.mockResolvedValue(null);
    await expect(service.remove(owner, 'client-1')).rejects.toThrow(NotFoundException);
  });

  it.each(['cases', 'additionalCaseRoles', 'caseCustomerRoles'])('refuses while %s still has a live case', async (key) => {
    mockPrisma.client.findFirst.mockResolvedValue(counts({ [key]: 1 }));
    await expect(service.remove(owner, 'client-1')).rejects.toThrow(ConflictException);
    expect(mockPrisma.client.delete).not.toHaveBeenCalled();
  });

  it('refuses while a sent invoice is billed to the client', async () => {
    mockPrisma.client.findFirst.mockResolvedValue(counts({ billedInvoices: 1 }));
    await expect(service.remove(owner, 'client-1')).rejects.toThrow(ConflictException);
    expect(mockPrisma.client.delete).not.toHaveBeenCalled();
  });
});
