import * as bcrypt from 'bcrypt';
import { UnauthorizedException } from '@nestjs/common';
import { InvitationService } from './invitation.service';

describe('accepting an invitation', () => {
  const invitation = { id: 'inv-1', firmId: 'firm-a', email: 'victim@x.com', role: 'LAWYER', acceptedAt: null, expiresAt: new Date(Date.now() + 60_000) };
  const build = (existingUser: unknown) => {
    const tx = { user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }) }, firmMember: { create: jest.fn() }, invitation: { update: jest.fn() }, auditLog: { create: jest.fn() } };
    const prisma = {
      invitation: { findUnique: jest.fn().mockResolvedValue(invitation) },
      user: { findUnique: jest.fn().mockResolvedValue(existingUser) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    } as any;
    const tenant = { assertCanAddMember: jest.fn().mockResolvedValue({ allowed: true }), buildAuthUser: jest.fn().mockResolvedValue({ id: 'new-user' }) } as any;
    return { svc: new (InvitationService as any)(prisma, tenant, {} as any) as InvitationService, tx };
  };
  const dto = { token: 't', firstName: 'a', lastName: 'b', password: 'guess123' } as any;

  it('the token alone never signs in as an existing account', async () => {
    const { svc, tx } = build({ id: 'victim', passwordHash: await bcrypt.hash('real-pass', 4) });
    await expect(svc.accept(dto)).rejects.toThrow(UnauthorizedException);
    expect(tx.firmMember.create).not.toHaveBeenCalled();
  });

  it('an existing account with its own password joins, then goes through normal login', async () => {
    const { svc, tx } = build({ id: 'victim', passwordHash: await bcrypt.hash('guess123', 4) });
    await expect(svc.accept(dto)).resolves.toEqual({ existingAccount: { email: 'victim@x.com', firmId: 'firm-a' } });
    expect(tx.firmMember.create).toHaveBeenCalled();
  });

  it('a new person gets an account and a session', async () => {
    const { svc } = build(null);
    await expect(svc.accept(dto)).resolves.toEqual({ authUser: { id: 'new-user' } });
  });
});
