import { NotFoundException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';

describe('PlatformAdminService.updateFirm', () => {
  const firm = {
    id: 'firm-1',
    subscriptionStatus: 'EXPIRED',
    subscriptionPlan: 'SOLO',
    maxUsers: 2,
    trialEndAt: new Date('2026-10-01T00:00:00Z'),
    currentPeriodEnd: null,
  };
  const prisma = {
    firm: { findUnique: jest.fn(), update: jest.fn((args) => args) },
    auditLog: { create: jest.fn((args) => args) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  const service = new PlatformAdminService(prisma as any);
  const admin = { email: 'owner@samnuan.com' } as any;

  beforeEach(() => jest.clearAllMocks());

  it('extends a trial and records who did it', async () => {
    prisma.firm.findUnique.mockResolvedValue(firm);
    await service.updateFirm(admin, 'firm-1', { subscriptionStatus: 'TRIAL' as any, trialEndAt: '2026-12-01T00:00:00Z' });

    const { data } = prisma.firm.update.mock.calls[0][0];
    expect(data.subscriptionStatus).toBe('TRIAL');
    expect(data.trialEndAt).toEqual(new Date('2026-12-01T00:00:00Z'));
    // Untouched fields stay undefined so Prisma leaves them alone.
    expect(data.currentPeriodEnd).toBeUndefined();
    expect(data.maxUsers).toBeUndefined();
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ firmId: 'firm-1', action: 'PLATFORM_FIRM_UPDATED', metadata: { by: 'owner@samnuan.com', from: { subscriptionStatus: 'EXPIRED' } } });
  });

  it('null currentPeriodEnd clears it', async () => {
    prisma.firm.findUnique.mockResolvedValue(firm);
    await service.updateFirm(admin, 'firm-1', { currentPeriodEnd: null });
    expect(prisma.firm.update.mock.calls[0][0].data.currentPeriodEnd).toBeNull();
  });

  it('404s an unknown firm', async () => {
    prisma.firm.findUnique.mockResolvedValue(null);
    await expect(service.updateFirm(admin, 'nope', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});
