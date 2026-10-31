import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { TenantService } from './tenant.service';
import { PrismaService } from '../prisma/prisma.service';

describe('TenantService.updateMemberWorkSettings', () => {
  let service: TenantService;
  const mockTx = { firmMember: { update: jest.fn() }, auditLog: { create: jest.fn() } };
  const mockPrisma = {
    firmMember: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  };
  const manager = { id: 'om-1', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx));
    const module = await Test.createTestingModule({
      providers: [TenantService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(TenantService);
  });

  it('office manager updates a member of the same firm and audits it', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue({ firmId: 'firm-1', userId: 'u-1' });
    await service.updateMemberWorkSettings(manager, 'u-1', { monthlyBillableTargetHours: 120, defaultHourlyRate: 3000 });
    expect(mockPrisma.firmMember.findUnique).toHaveBeenCalledWith({
      where: { firmId_userId: { firmId: 'firm-1', userId: 'u-1' } },
    });
    expect(mockTx.firmMember.update).toHaveBeenCalledWith({
      where: { firmId_userId: { firmId: 'firm-1', userId: 'u-1' } },
      data: { monthlyBillableTargetHours: 120, defaultHourlyRate: 3000 },
    });
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firmId: 'firm-1',
        userId: 'om-1',
        action: 'MEMBER_WORK_SETTINGS_UPDATED',
      }),
    });
  });

  it('null clears a value; omitted keys are untouched', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue({ firmId: 'firm-1', userId: 'u-1' });
    await service.updateMemberWorkSettings(manager, 'u-1', { defaultHourlyRate: null });
    expect(mockTx.firmMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { defaultHourlyRate: null } }),
    );
  });

  it('member of another firm is NotFound', async () => {
    mockPrisma.firmMember.findUnique.mockResolvedValue(null);
    await expect(
      service.updateMemberWorkSettings(manager, 'other-firm-user', { monthlyBillableTargetHours: 10 }),
    ).rejects.toThrow(NotFoundException);
    expect(mockTx.firmMember.update).not.toHaveBeenCalled();
  });

  it('lawyer is Forbidden', async () => {
    const lawyer = { id: 'l-1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as any;
    await expect(
      service.updateMemberWorkSettings(lawyer, 'u-1', { monthlyBillableTargetHours: 10 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it.each([
    [{ monthlyBillableTargetHours: -1 }],
    [{ defaultHourlyRate: -5 }],
    [{ monthlyBillableTargetHours: 401 }],
    [{ defaultHourlyRate: Number.NaN }],
  ])('rejects invalid %j with BadRequest', async (dto) => {
    await expect(service.updateMemberWorkSettings(manager, 'u-1', dto)).rejects.toThrow(BadRequestException);
    expect(mockTx.firmMember.update).not.toHaveBeenCalled();
  });
});
