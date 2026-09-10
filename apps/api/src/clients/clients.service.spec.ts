import { Test, TestingModule } from '@nestjs/testing';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { FirmRole } from '@lawfirm/shared';

describe('ClientsService.update contact upsert', () => {
  let service: ClientsService;
  const mockPrisma: any = {
    client: { findFirst: jest.fn(), update: jest.fn() },
    clientContact: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
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
