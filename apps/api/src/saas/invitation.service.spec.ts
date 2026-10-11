import { ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { InvitationService } from './invitation.service';

describe('InvitationService.invite role ceiling', () => {
  const build = () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      invitation: {
        upsert: jest.fn().mockResolvedValue({ id: 'i1', email: 'x@y.com', role: FirmRole.SENIOR_LAWYER, token: 't', expiresAt: new Date() }),
        create: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    } as any;
    const tenant = { assertCanInvite: jest.fn().mockResolvedValue({ allowed: true }) } as any;
    const email = { getAppUrl: () => 'http://app', isConfigured: () => false } as any;
    return { svc: new InvitationService(prisma, tenant, email), prisma };
  };
  const manager = { id: 'm1', firmId: 'f1', firmRole: FirmRole.OFFICE_MANAGER, firstName: 'a', lastName: 'b', firmName: 'F' } as any;

  it('office manager can invite a senior lawyer', async () => {
    const { svc, prisma } = build();
    await svc.invite(manager, { email: 'x@y.com', role: FirmRole.SENIOR_LAWYER } as any);
    expect(prisma.invitation.upsert).toHaveBeenCalled();
  });

  it.each([FirmRole.OWNER, FirmRole.OFFICE_MANAGER])('office manager cannot invite %s', async (role) => {
    const { svc, prisma } = build();
    await expect(svc.invite(manager, { email: 'x@y.com', role } as any)).rejects.toThrow(ForbiddenException);
    expect(prisma.invitation.upsert).not.toHaveBeenCalled();
    expect(prisma.invitation.create).not.toHaveBeenCalled();
  });

  it('a lawyer cannot invite at all', async () => {
    const { svc } = build();
    await expect(svc.invite({ ...manager, firmRole: FirmRole.LAWYER }, { email: 'x@y.com' } as any)).rejects.toThrow(ForbiddenException);
  });

  it('office manager can list pending invitations', async () => {
    const { svc, prisma } = build();
    prisma.invitation.findMany = jest.fn().mockResolvedValue([]);
    await expect(svc.listPending(manager)).resolves.toEqual([]);
  });
});
