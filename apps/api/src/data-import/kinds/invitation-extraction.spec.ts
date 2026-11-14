import { FirmRole } from '@lawfirm/shared';
import { InvitationService } from '../../saas/invitation.service';
import type { PrismaService } from '../../prisma/prisma.module';
import type { Prisma } from '../../generated/prisma';
import type { TenantService } from '../../saas/tenant.service';
import type { EmailService } from '../../notifications/email.service';
import { importUser } from './import-kind.fixtures';

describe('shared invitation persistence and email delivery', () => {
  it('writes a rotated 32-byte token and seven-day renewal through the supplied transaction', async () => {
    const tx = { invitation: { upsert: jest.fn().mockImplementation(async (args) => ({ id: 'invitation', ...args.create })) }, auditLog: { create: jest.fn() } };
    const original = { invitation: { upsert: jest.fn() } };
    const service = new InvitationService(original as unknown as PrismaService, {} as TenantService, {} as EmailService);
    const before = Date.now();
    const invitation = await service.createForImport(tx as unknown as Prisma.TransactionClient, importUser, 'new@example.com', FirmRole.LAWYER);
    expect(original.invitation.upsert).not.toHaveBeenCalled();
    expect(invitation.token).toMatch(/^[a-f0-9]{64}$/);
    expect(invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    expect(invitation.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expect(tx.invitation.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId_email: { firmId: importUser.firmId, email: 'new@example.com' } }, update: expect.objectContaining({ acceptedAt: null, token: invitation.token, role: FirmRole.LAWYER, invitedById: importUser.id }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ firmId: importUser.firmId, action: 'USER_INVITED' }) });
  });
  it('shares the normal invitation email shape, returns delivery status and swallows provider failures', async () => {
    const email = { isConfigured: jest.fn().mockReturnValue(true), getAppUrl: () => 'https://app.example.com', sendInvitationEmail: jest.fn().mockResolvedValue(undefined) };
    const service = new InvitationService({} as PrismaService, {} as TenantService, email as unknown as EmailService);
    const invitation = { email: 'new@example.com', role: FirmRole.ASSISTANT, token: 'secret-token', expiresAt: new Date('2030-01-01') };
    await expect(service.sendInvitation(importUser, invitation)).resolves.toBe(true);
    expect(email.sendInvitationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: invitation.email, firmName: importUser.firmName, inviteUrl: 'https://app.example.com/invite/secret-token', expiresAt: invitation.expiresAt }));
    email.sendInvitationEmail.mockRejectedValue(new Error('provider unavailable'));
    await expect(service.sendInvitation(importUser, invitation)).resolves.toBe(false);
    email.isConfigured.mockReturnValue(false);
    email.sendInvitationEmail.mockClear();
    await expect(service.sendInvitation(importUser, invitation)).resolves.toBe(false);
    expect(email.sendInvitationEmail).not.toHaveBeenCalled();
  });
});
