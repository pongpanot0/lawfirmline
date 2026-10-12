import { ForbiddenException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { InvitationService } from './invitation.service';

describe('InvitationService.invite role ceiling', () => {
  const build = () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      invitation: {
        findUnique: jest.fn().mockResolvedValue(null),
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

describe('InvitationService token safety and role ceiling on existing invites', () => {
  const build = (existing: any = null) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      invitation: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'i1', email: 'x@y.com', role: FirmRole.LAWYER, token: 't', expiresAt: new Date() }),
        delete: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    } as any;
    const tenant = { assertCanInvite: jest.fn().mockResolvedValue({ allowed: true }) } as any;
    const email = { getAppUrl: () => 'http://app', isConfigured: () => false } as any;
    return { svc: new InvitationService(prisma, tenant, email), prisma };
  };
  const manager = { id: 'm1', firmId: 'f1', firmRole: FirmRole.OFFICE_MANAGER, firstName: 'a', lastName: 'b', firmName: 'F' } as any;
  const owner = { ...manager, id: 'o1', firmRole: FirmRole.OWNER };
  const ownerInvite = { id: 'i1', firmId: 'f1', email: 'x@y.com', role: FirmRole.OWNER, acceptedAt: null, expiresAt: new Date(Date.now() + 86400000) };

  it('listPending selects no token', async () => {
    const { svc, prisma } = build();
    await svc.listPending(manager);
    const args = prisma.invitation.findMany.mock.calls[0][0];
    expect(args.select).toBeDefined();
    expect(args.select.token).toBeUndefined();
    expect(args.select).toMatchObject({ id: true, email: true, role: true, expiresAt: true, createdAt: true });
  });

  it('office manager cannot cancel an OWNER invitation', async () => {
    const { svc, prisma } = build(ownerInvite);
    await expect(svc.cancel(manager, 'i1')).rejects.toThrow(ForbiddenException);
    expect(prisma.invitation.delete).not.toHaveBeenCalled();
  });

  it('office manager cannot overwrite a pending OWNER invitation', async () => {
    const { svc, prisma } = build(ownerInvite);
    await expect(svc.invite(manager, { email: 'x@y.com', role: FirmRole.LAWYER } as any)).rejects.toThrow(ForbiddenException);
    expect(prisma.invitation.upsert).not.toHaveBeenCalled();
  });

  it('owner can still list, cancel and overwrite an OWNER invitation', async () => {
    const { svc, prisma } = build(ownerInvite);
    await svc.listPending(owner);
    await expect(svc.cancel(owner, 'i1')).resolves.toEqual({ success: true });
    await svc.invite(owner, { email: 'x@y.com', role: FirmRole.LAWYER } as any);
    expect(prisma.invitation.upsert).toHaveBeenCalled();
  });
});
