import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TenantService.updateMemberRole', () => {
  let service: TenantService;
  const mockPrisma = {
    firmMember: { findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
  };
  const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(TenantService);
  });

  it('throws ForbiddenException when the caller is not an owner', async () => {
    const nonOwner = { id: 'u2', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
    await expect(
      service.updateMemberRole(nonOwner, 'target-1', FirmRole.SENIOR_LAWYER),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when the target member does not exist', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue(null);
    await expect(
      service.updateMemberRole(owner, 'missing-1', FirmRole.LAWYER),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when demoting the only owner', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue({
      firmId: 'firm-1',
      userId: 'owner-1',
      role: FirmRole.OWNER,
    });
    mockPrisma.firmMember.count.mockResolvedValue(1);

    await expect(
      service.updateMemberRole(owner, 'owner-1', FirmRole.LAWYER),
    ).rejects.toThrow(BadRequestException);
  });

  it('updates the role when demoting an owner is not the last one', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue({
      firmId: 'firm-1',
      userId: 'owner-2',
      role: FirmRole.OWNER,
    });
    mockPrisma.firmMember.count.mockResolvedValue(2);
    mockPrisma.firmMember.update.mockResolvedValue({});

    const result = await service.updateMemberRole(owner, 'owner-2', FirmRole.SENIOR_LAWYER);

    expect(result).toEqual({ success: true });
    expect(mockPrisma.firmMember.update).toHaveBeenCalledWith({
      where: { firmId_userId: { firmId: 'firm-1', userId: 'owner-2' } },
      data: { role: FirmRole.SENIOR_LAWYER },
    });
  });

  it('updates a non-owner member freely', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue({
      firmId: 'firm-1',
      userId: 'lawyer-1',
      role: FirmRole.LAWYER,
    });
    mockPrisma.firmMember.update.mockResolvedValue({});

    const result = await service.updateMemberRole(owner, 'lawyer-1', FirmRole.SENIOR_LAWYER);

    expect(result).toEqual({ success: true });
    expect(mockPrisma.firmMember.count).not.toHaveBeenCalled();
  });
});
